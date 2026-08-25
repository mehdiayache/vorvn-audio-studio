"""Apply Auvi Studio's pending database migrations."""

from audio_studio.migrations import run


def main() -> None:
    applied = run()
    if applied:
        print(f"Applied {len(applied)} migration(s): {', '.join(applied)}")
    else:
        print("Database schema is current.")


if __name__ == "__main__":
    main()
