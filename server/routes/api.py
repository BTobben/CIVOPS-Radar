"""API route definitions including v1 and legacy compatibility shims."""

from __future__ import annotations

import os

from flask import Blueprint, jsonify, request, send_file

from server.schemas.envelope import error, success
from server.services.radar_service import RadarService


def build_api_blueprint(service: RadarService) -> Blueprint:
    api = Blueprint("api", __name__)

    @api.get("/api/v1/health")
    def v1_health():
        return jsonify(success(service.health()))

    @api.get("/api/v1/signals")
    def v1_signals():
        return jsonify(success({"signals": service.get_signals()}))

    @api.get("/api/v1/statistics")
    def v1_statistics():
        return jsonify(success(service.statistics()))

    @api.get("/api/v1/networks/<bssid>")
    def v1_network_details(bssid: str):
        details = service.network_details(bssid)
        if not details:
            payload, status = error("network_not_found", "Network not found", status=404)
            return jsonify(payload), status
        return jsonify(success(details))

    @api.post("/api/v1/scan/start")
    @api.get("/api/v1/scan/start")
    def v1_scan_start():
        return jsonify(success(service.start_scan()))

    @api.post("/api/v1/scan/stop")
    @api.get("/api/v1/scan/stop")
    def v1_scan_stop():
        return jsonify(success(service.stop_scan()))

    @api.get("/api/v1/export/<format_type>")
    def v1_export(format_type: str):
        try:
            manifest = service.export_data(format_type)
            manifest["download_path"] = f"/api/export/{format_type}?file={manifest['filename']}"
            return jsonify(success(manifest))
        except ValueError as exc:
            payload, status = error("unsupported_format", str(exc), status=400)
            return jsonify(payload), status

    @api.get("/api/v1/session/scaffold")
    def v1_session_scaffold():
        return jsonify(success(service.session_contract()))

    # Legacy compatibility routes (non-versioned)
    @api.get("/api/signals")
    def legacy_signals():
        return jsonify({
            "signals": service.get_signals(),
            "timestamp": service.health()["scanner"]["timestamp"],
        })

    @api.get("/api/statistics")
    def legacy_statistics():
        return jsonify(service.statistics())

    @api.get("/api/network/<bssid>")
    def legacy_network_details(bssid: str):
        details = service.network_details(bssid)
        if not details:
            return jsonify({"error": "Network not found"}), 404
        return jsonify(details)

    @api.get("/api/scan/start")
    def legacy_scan_start():
        return jsonify(service.start_scan())

    @api.get("/api/scan/stop")
    def legacy_scan_stop():
        return jsonify(service.stop_scan())

    @api.get("/api/export/<format_type>")
    def legacy_export(format_type: str):
        filename = request.args.get("file")
        if not filename:
            manifest = service.export_data(format_type)
            filename = manifest["filename"]
            filepath = manifest["filepath"]
        else:
            safe_name = os.path.basename(filename)
            filepath = os.path.join(service.export_dir, safe_name)
            filename = safe_name

        if not os.path.exists(filepath):
            return jsonify({"error": "Export file not found"}), 404

        return send_file(filepath, as_attachment=True, download_name=filename)

    return api
