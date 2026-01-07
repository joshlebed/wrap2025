#!/usr/bin/env python3
"""
Simple dev server for the chart.
Serves from parent directory so CSV is accessible.
Usage: python3 chart/serve.py
"""

import http.server
import os
import webbrowser
from functools import partial

PORT = 8000

def main():
    # Change to parent directory so CSV is accessible
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    handler = partial(http.server.SimpleHTTPRequestHandler, directory=".")

    with http.server.HTTPServer(("", PORT), handler) as httpd:
        url = f"http://localhost:{PORT}/chart/"
        print(f"Serving at {url}")
        print("Press Ctrl+C to stop")
        webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped")


if __name__ == "__main__":
    main()
