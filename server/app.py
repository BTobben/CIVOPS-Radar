#!/usr/bin/env python3
"""CIVOPS-Radar Flask application bootstrap."""

from __future__ import annotations

import os

from flask import Flask, jsonify, render_template
from flask_cors import CORS

from server.config import load_config
from server.repositories.scan_repository import ScanRepository
from server.routes.api import build_api_blueprint
from server.scanners.factory import build_scanner
from server.services.radar_service import RadarService


def create_app() -> Flask:
    config = load_config()
    os.makedirs(os.path.dirname(config.db_path), exist_ok=True)
    os.makedirs(config.export_dir, exist_ok=True)

    repository = ScanRepository(config.db_path)
    repository.initialize()

    scanner = build_scanner(config.scanner_backend)
    service = RadarService(repository=repository, scanner=scanner, export_dir=config.export_dir)

    app = Flask(__name__)
    CORS(app)
    app.register_blueprint(build_api_blueprint(service))

    @app.get("/")
    def index():
        return render_template("radar.html")

    @app.errorhandler(404)
    def not_found(_error):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(500)
    def internal_error(_error):
        return jsonify({"error": "Internal server error"}), 500

    return app


app = create_app()


def run_server(host: str = "0.0.0.0", port: int = 5000, debug: bool = False) -> None:
    print("Starting CIVOPS-Radar web server...")
    print(f"Web interface: http://{host}:{port}")
    app.run(host=host, port=port, debug=debug, threaded=True)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="CIVOPS-Radar Web Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=5000, help="Port to bind to")
    parser.add_argument("--debug", action="store_true", help="Enable debug mode")

    args = parser.parse_args()
    run_server(host=args.host, port=args.port, debug=args.debug)
