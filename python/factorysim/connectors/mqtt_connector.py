"""
MQTT Connector - Connect to IoT sensors via MQTT protocol.
"""

from typing import Dict, Any, Optional, Callable, List
from dataclasses import dataclass, field
from datetime import datetime
import json
import threading
import queue

try:
    import paho.mqtt.client as mqtt
    MQTT_AVAILABLE = True
except ImportError:
    MQTT_AVAILABLE = False


@dataclass
class MQTTMessage:
    """Represents an MQTT message."""
    topic: str
    payload: Dict[str, Any]
    timestamp: datetime
    qos: int = 0


@dataclass
class MQTTConfig:
    """Configuration for MQTT connection."""
    broker: str
    port: int = 1883
    username: Optional[str] = None
    password: Optional[str] = None
    client_id: str = "factorysim"
    topics: List[str] = field(default_factory=list)
    qos: int = 1


class MQTTConnector:
    """
    Connector for IoT data via MQTT protocol.

    Supports:
    - Real-time machine status updates
    - Sensor data streaming
    - Event-driven data collection
    """

    def __init__(self, config: MQTTConfig):
        """
        Initialize MQTT connector.

        Args:
            config: MQTT configuration
        """
        if not MQTT_AVAILABLE:
            raise ImportError("paho-mqtt library is required for MQTT connectivity")

        self.config = config
        self.client: Optional[mqtt.Client] = None
        self.connected = False
        self.message_queue: queue.Queue = queue.Queue(maxsize=10000)
        self.callbacks: Dict[str, List[Callable]] = {}
        self.last_messages: Dict[str, MQTTMessage] = {}

        self._setup_client()

    def _setup_client(self) -> None:
        """Set up MQTT client."""
        self.client = mqtt.Client(client_id=self.config.client_id)

        if self.config.username and self.config.password:
            self.client.username_pw_set(
                self.config.username,
                self.config.password
            )

        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

    def _on_connect(self, client, userdata, flags, rc):
        """Handle connection event."""
        if rc == 0:
            self.connected = True
            # Subscribe to configured topics
            for topic in self.config.topics:
                client.subscribe(topic, qos=self.config.qos)
        else:
            self.connected = False

    def _on_disconnect(self, client, userdata, rc):
        """Handle disconnection event."""
        self.connected = False

    def _on_message(self, client, userdata, msg):
        """Handle incoming message."""
        try:
            payload = json.loads(msg.payload.decode('utf-8'))
        except json.JSONDecodeError:
            payload = {'raw': msg.payload.decode('utf-8')}

        message = MQTTMessage(
            topic=msg.topic,
            payload=payload,
            timestamp=datetime.now(),
            qos=msg.qos,
        )

        # Store latest message
        self.last_messages[msg.topic] = message

        # Add to queue
        try:
            self.message_queue.put_nowait(message)
        except queue.Full:
            # Remove oldest message and add new one
            try:
                self.message_queue.get_nowait()
                self.message_queue.put_nowait(message)
            except queue.Empty:
                pass

        # Call registered callbacks
        if msg.topic in self.callbacks:
            for callback in self.callbacks[msg.topic]:
                try:
                    callback(message)
                except Exception:
                    pass

    def connect(self) -> Dict[str, Any]:
        """
        Connect to MQTT broker.

        Returns:
            Connection result
        """
        try:
            self.client.connect(
                self.config.broker,
                self.config.port,
                keepalive=60
            )
            self.client.loop_start()

            # Wait for connection
            timeout = 10
            while not self.connected and timeout > 0:
                import time
                time.sleep(0.1)
                timeout -= 0.1

            return {
                'success': self.connected,
                'broker': self.config.broker,
                'port': self.config.port,
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
            }

    def disconnect(self) -> None:
        """Disconnect from MQTT broker."""
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
        self.connected = False

    def subscribe(self, topic: str, callback: Optional[Callable] = None) -> Dict[str, Any]:
        """
        Subscribe to a topic.

        Args:
            topic: MQTT topic to subscribe to
            callback: Optional callback function for messages

        Returns:
            Subscription result
        """
        if not self.connected:
            return {'success': False, 'error': 'Not connected'}

        try:
            self.client.subscribe(topic, qos=self.config.qos)

            if callback:
                if topic not in self.callbacks:
                    self.callbacks[topic] = []
                self.callbacks[topic].append(callback)

            return {'success': True, 'topic': topic}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def unsubscribe(self, topic: str) -> Dict[str, Any]:
        """
        Unsubscribe from a topic.

        Args:
            topic: MQTT topic to unsubscribe from

        Returns:
            Unsubscription result
        """
        if not self.connected:
            return {'success': False, 'error': 'Not connected'}

        try:
            self.client.unsubscribe(topic)

            if topic in self.callbacks:
                del self.callbacks[topic]

            return {'success': True, 'topic': topic}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def get_latest(self, topic: str) -> Optional[MQTTMessage]:
        """
        Get the latest message for a topic.

        Args:
            topic: MQTT topic

        Returns:
            Latest message or None
        """
        return self.last_messages.get(topic)

    def get_messages(self, max_count: int = 100) -> List[MQTTMessage]:
        """
        Get messages from the queue.

        Args:
            max_count: Maximum number of messages to retrieve

        Returns:
            List of messages
        """
        messages = []
        while len(messages) < max_count:
            try:
                msg = self.message_queue.get_nowait()
                messages.append(msg)
            except queue.Empty:
                break
        return messages

    def parse_machine_status(self, message: MQTTMessage) -> Dict[str, Any]:
        """
        Parse machine status from MQTT message.

        Expected payload format:
        {
            "machine_id": "station_1",
            "status": "running|idle|failed",
            "temperature": 45.2,
            "vibration": 0.5,
            "power": 2500
        }
        """
        payload = message.payload

        return {
            'machine_id': payload.get('machine_id'),
            'status': payload.get('status', 'unknown'),
            'timestamp': message.timestamp.isoformat(),
            'sensors': {
                'temperature': payload.get('temperature'),
                'vibration': payload.get('vibration'),
                'power': payload.get('power'),
            },
        }

    def parse_production_event(self, message: MQTTMessage) -> Dict[str, Any]:
        """
        Parse production event from MQTT message.

        Expected payload format:
        {
            "event_type": "part_complete|cycle_start|cycle_end",
            "station_id": "station_1",
            "part_id": "part_123",
            "cycle_time": 45.2
        }
        """
        payload = message.payload

        return {
            'event_type': payload.get('event_type'),
            'station_id': payload.get('station_id'),
            'part_id': payload.get('part_id'),
            'cycle_time': payload.get('cycle_time'),
            'timestamp': message.timestamp.isoformat(),
        }
