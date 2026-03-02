"""
OPC-UA Connector - Connect to industrial systems via OPC-UA protocol.
"""

from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from datetime import datetime

try:
    from opcua import Client, ua
    OPCUA_AVAILABLE = True
except ImportError:
    OPCUA_AVAILABLE = False


@dataclass
class OPCUANode:
    """Represents an OPC-UA node."""
    node_id: str
    display_name: str
    value: Any
    data_type: str
    timestamp: datetime


@dataclass
class OPCUAConfig:
    """Configuration for OPC-UA connection."""
    endpoint: str
    username: Optional[str] = None
    password: Optional[str] = None
    security_policy: Optional[str] = None
    certificate_path: Optional[str] = None


class OPCUAConnector:
    """
    Connector for industrial OPC-UA servers.

    Supports:
    - Reading machine data
    - Subscribing to data changes
    - Browsing server namespace
    """

    def __init__(self, config: OPCUAConfig):
        """
        Initialize OPC-UA connector.

        Args:
            config: OPC-UA configuration
        """
        if not OPCUA_AVAILABLE:
            raise ImportError("opcua library is required for OPC-UA connectivity")

        self.config = config
        self.client: Optional[Client] = None
        self.connected = False
        self.subscriptions: Dict[str, Any] = {}

    def connect(self) -> Dict[str, Any]:
        """
        Connect to OPC-UA server.

        Returns:
            Connection result
        """
        try:
            self.client = Client(self.config.endpoint)

            if self.config.username and self.config.password:
                self.client.set_user(self.config.username)
                self.client.set_password(self.config.password)

            if self.config.security_policy:
                self.client.set_security_string(self.config.security_policy)

            if self.config.certificate_path:
                self.client.load_certificate(self.config.certificate_path)

            self.client.connect()
            self.connected = True

            return {
                'success': True,
                'endpoint': self.config.endpoint,
                'server_info': self._get_server_info(),
            }
        except Exception as e:
            self.connected = False
            return {
                'success': False,
                'error': str(e),
            }

    def disconnect(self) -> None:
        """Disconnect from OPC-UA server."""
        if self.client:
            try:
                self.client.disconnect()
            except Exception:
                pass
        self.connected = False

    def _get_server_info(self) -> Dict[str, Any]:
        """Get server information."""
        if not self.client:
            return {}

        try:
            root = self.client.get_root_node()
            server_node = root.get_child(["0:Objects", "0:Server"])

            return {
                'server_status': 'running',
                'root_node': str(root),
            }
        except Exception:
            return {}

    def read_node(self, node_id: str) -> Dict[str, Any]:
        """
        Read a single node value.

        Args:
            node_id: OPC-UA node ID (e.g., "ns=2;i=1234")

        Returns:
            Node value and metadata
        """
        if not self.connected:
            return {'success': False, 'error': 'Not connected'}

        try:
            node = self.client.get_node(node_id)
            value = node.get_value()
            data_type = node.get_data_type_as_variant_type()

            return {
                'success': True,
                'node_id': node_id,
                'value': value,
                'data_type': str(data_type),
                'timestamp': datetime.now().isoformat(),
            }
        except Exception as e:
            return {
                'success': False,
                'node_id': node_id,
                'error': str(e),
            }

    def read_nodes(self, node_ids: List[str]) -> Dict[str, Any]:
        """
        Read multiple node values.

        Args:
            node_ids: List of OPC-UA node IDs

        Returns:
            Dictionary of node values
        """
        if not self.connected:
            return {'success': False, 'error': 'Not connected'}

        results = {}
        for node_id in node_ids:
            result = self.read_node(node_id)
            results[node_id] = result

        return {
            'success': True,
            'nodes': results,
            'timestamp': datetime.now().isoformat(),
        }

    def browse_node(self, node_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Browse child nodes of a node.

        Args:
            node_id: Parent node ID (None for root)

        Returns:
            List of child nodes
        """
        if not self.connected:
            return {'success': False, 'error': 'Not connected'}

        try:
            if node_id:
                node = self.client.get_node(node_id)
            else:
                node = self.client.get_root_node()

            children = []
            for child in node.get_children():
                try:
                    children.append({
                        'node_id': str(child.nodeid),
                        'display_name': child.get_display_name().Text,
                        'node_class': str(child.get_node_class()),
                    })
                except Exception:
                    continue

            return {
                'success': True,
                'parent': node_id or 'root',
                'children': children,
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
            }

    def subscribe_node(
        self,
        node_id: str,
        callback: Optional[callable] = None,
        interval: int = 1000
    ) -> Dict[str, Any]:
        """
        Subscribe to node value changes.

        Args:
            node_id: OPC-UA node ID
            callback: Function to call on value change
            interval: Sampling interval in milliseconds

        Returns:
            Subscription result
        """
        if not self.connected:
            return {'success': False, 'error': 'Not connected'}

        try:
            handler = SubHandler(callback)
            sub = self.client.create_subscription(interval, handler)

            node = self.client.get_node(node_id)
            handle = sub.subscribe_data_change(node)

            self.subscriptions[node_id] = {
                'subscription': sub,
                'handle': handle,
                'handler': handler,
            }

            return {
                'success': True,
                'node_id': node_id,
                'interval': interval,
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
            }

    def unsubscribe_node(self, node_id: str) -> Dict[str, Any]:
        """
        Unsubscribe from node value changes.

        Args:
            node_id: OPC-UA node ID

        Returns:
            Unsubscription result
        """
        if node_id not in self.subscriptions:
            return {'success': False, 'error': 'No subscription found'}

        try:
            sub_info = self.subscriptions[node_id]
            sub_info['subscription'].unsubscribe(sub_info['handle'])
            sub_info['subscription'].delete()
            del self.subscriptions[node_id]

            return {'success': True, 'node_id': node_id}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def get_machine_data(self, machine_node_id: str) -> Dict[str, Any]:
        """
        Get comprehensive machine data from a machine node.

        Expects a machine node with standard children:
        - Status
        - CycleTime
        - PartCount
        - Temperature
        - etc.

        Args:
            machine_node_id: Node ID of the machine object

        Returns:
            Machine data dictionary
        """
        if not self.connected:
            return {'success': False, 'error': 'Not connected'}

        try:
            children = self.browse_node(machine_node_id)

            if not children.get('success'):
                return children

            data = {
                'machine_id': machine_node_id,
                'timestamp': datetime.now().isoformat(),
            }

            for child in children.get('children', []):
                node_result = self.read_node(child['node_id'])
                if node_result.get('success'):
                    # Use display name as key
                    key = child['display_name'].lower().replace(' ', '_')
                    data[key] = node_result['value']

            return {
                'success': True,
                'data': data,
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
            }


class SubHandler:
    """Handler for OPC-UA subscriptions."""

    def __init__(self, callback: Optional[callable] = None):
        self.callback = callback
        self.last_value = None
        self.last_timestamp = None

    def datachange_notification(self, node, val, data):
        """Called when subscribed data changes."""
        self.last_value = val
        self.last_timestamp = datetime.now()

        if self.callback:
            try:
                self.callback({
                    'node_id': str(node),
                    'value': val,
                    'timestamp': self.last_timestamp.isoformat(),
                })
            except Exception:
                pass
