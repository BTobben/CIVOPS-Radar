import os
import tempfile
import unittest

from server.app import create_app


class ApiV1TestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ['RADAR_DIR'] = self.tmp.name
        os.environ['RADAR_DB_PATH'] = os.path.join(self.tmp.name, 'data', 'scans.db')
        os.environ['RADAR_EXPORT_DIR'] = os.path.join(self.tmp.name, 'exports')
        os.environ['RADAR_SCANNER_BACKEND'] = 'mock'

        self.app = create_app()
        self.client = self.app.test_client()

    def tearDown(self):
        self.tmp.cleanup()

    def test_v1_signals_envelope(self):
        response = self.client.get('/api/v1/signals')
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload['version'], 'v1')
        self.assertTrue(payload['ok'])
        self.assertIn('signals', payload['data'])

    def test_legacy_endpoint_still_available(self):
        response = self.client.get('/api/signals')
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIn('signals', payload)

    def test_health_endpoint(self):
        response = self.client.get('/api/v1/health')
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload['ok'])
        self.assertIn('scanner', payload['data'])


if __name__ == '__main__':
    unittest.main()
