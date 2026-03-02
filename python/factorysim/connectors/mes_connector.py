"""
MES Connector - Connect to Manufacturing Execution Systems via REST API.
"""

from typing import Dict, Any, Optional, List
import json
import time
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError


class MESConnector:
    """
    Connector for Manufacturing Execution System (MES) integration.

    Supports REST API communication for:
    - Production orders
    - Machine status
    - Quality data
    - Inventory levels
    """

    def __init__(self, base_url: str, api_key: Optional[str] = None):
        """
        Initialize MES connector.

        Args:
            base_url: Base URL of the MES API
            api_key: Optional API key for authentication
        """
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.timeout = 30
        self.last_sync: Optional[datetime] = None

    def _make_request(
        self,
        endpoint: str,
        method: str = 'GET',
        data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Make an HTTP request to the MES API."""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"

        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }

        if self.api_key:
            headers['Authorization'] = f'Bearer {self.api_key}'

        request_data = None
        if data:
            request_data = json.dumps(data).encode('utf-8')

        try:
            req = Request(url, data=request_data, headers=headers, method=method)
            with urlopen(req, timeout=self.timeout) as response:
                return json.loads(response.read().decode('utf-8'))
        except HTTPError as e:
            return {
                'error': True,
                'status_code': e.code,
                'message': str(e.reason),
            }
        except URLError as e:
            return {
                'error': True,
                'message': f'Connection error: {e.reason}',
            }
        except Exception as e:
            return {
                'error': True,
                'message': str(e),
            }

    def test_connection(self) -> Dict[str, Any]:
        """Test the connection to the MES."""
        try:
            result = self._make_request('/health')
            return {
                'connected': 'error' not in result,
                'response': result,
            }
        except Exception as e:
            return {
                'connected': False,
                'error': str(e),
            }

    def get_production_orders(
        self,
        status: Optional[str] = None,
        limit: int = 100
    ) -> Dict[str, Any]:
        """
        Get production orders from MES.

        Args:
            status: Filter by order status (e.g., 'active', 'completed')
            limit: Maximum number of orders to return

        Returns:
            Dictionary with orders and metadata
        """
        params = f"?limit={limit}"
        if status:
            params += f"&status={status}"

        result = self._make_request(f'/orders{params}')

        if 'error' in result:
            return result

        return {
            'success': True,
            'orders': result.get('orders', []),
            'total': result.get('total', len(result.get('orders', []))),
        }

    def get_machine_status(self, machine_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Get current status of machines.

        Args:
            machine_ids: Optional list of specific machine IDs

        Returns:
            Dictionary with machine statuses
        """
        endpoint = '/machines/status'
        if machine_ids:
            endpoint += f"?ids={','.join(machine_ids)}"

        result = self._make_request(endpoint)

        if 'error' in result:
            return result

        return {
            'success': True,
            'machines': result.get('machines', []),
            'timestamp': datetime.now().isoformat(),
        }

    def get_cycle_times(
        self,
        station_id: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Get historical cycle time data for a station.

        Args:
            station_id: ID of the station
            start_time: Start of time range
            end_time: End of time range

        Returns:
            Dictionary with cycle time data
        """
        params = f"?station_id={station_id}"
        if start_time:
            params += f"&start={start_time.isoformat()}"
        if end_time:
            params += f"&end={end_time.isoformat()}"

        result = self._make_request(f'/cycle-times{params}')

        if 'error' in result:
            return result

        return {
            'success': True,
            'station_id': station_id,
            'data': result.get('cycle_times', []),
            'statistics': {
                'count': len(result.get('cycle_times', [])),
                'mean': result.get('mean'),
                'std': result.get('std'),
            },
        }

    def get_quality_data(
        self,
        station_id: Optional[str] = None,
        limit: int = 1000
    ) -> Dict[str, Any]:
        """
        Get quality/scrap data.

        Args:
            station_id: Optional station ID filter
            limit: Maximum records to return

        Returns:
            Dictionary with quality data
        """
        params = f"?limit={limit}"
        if station_id:
            params += f"&station_id={station_id}"

        result = self._make_request(f'/quality{params}')

        if 'error' in result:
            return result

        return {
            'success': True,
            'data': result.get('quality_records', []),
            'summary': {
                'total_inspected': result.get('total_inspected', 0),
                'total_defects': result.get('total_defects', 0),
                'defect_rate': result.get('defect_rate', 0),
            },
        }

    def sync_model_parameters(self, model: Dict[str, Any]) -> Dict[str, Any]:
        """
        Synchronize model parameters with MES data.

        Args:
            model: Factory model to update

        Returns:
            Updated model with synchronized parameters
        """
        updated_stations = []

        for station in model.get('stations', []):
            station_id = station.get('id')

            # Get cycle time data
            cycle_data = self.get_cycle_times(station_id)
            if cycle_data.get('success') and cycle_data.get('statistics', {}).get('mean'):
                station['cycleTime'] = {
                    'type': 'normal',
                    'parameters': {
                        'mean': cycle_data['statistics']['mean'],
                        'std': cycle_data['statistics'].get('std', 0),
                    },
                }

            # Get quality data
            quality_data = self.get_quality_data(station_id)
            if quality_data.get('success'):
                station['scrapRate'] = quality_data['summary'].get('defect_rate', 0)

            updated_stations.append(station)

        self.last_sync = datetime.now()

        return {
            'success': True,
            'model': {
                **model,
                'stations': updated_stations,
            },
            'sync_time': self.last_sync.isoformat(),
        }
