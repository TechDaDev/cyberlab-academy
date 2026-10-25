"""Export the authoritative OpenAPI contract from the running FastAPI app.

Usage (from the backend directory):  python scripts/export_openapi.py
Writes ../shared-contracts/openapi.json with sorted keys and two-space indentation so the
committed contract stays reviewable and diff-stable.
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from app.main import app  # noqa: E402

TARGET = pathlib.Path(__file__).resolve().parent.parent.parent / "shared-contracts" / "openapi.json"


def main() -> None:
    contract = app.openapi()
    TARGET.write_text(json.dumps(contract, indent=2, sort_keys=True) + "\n")
    print(f"wrote {TARGET} ({len(contract['paths'])} paths, version {contract['info']['version']})")


if __name__ == "__main__":
    main()
