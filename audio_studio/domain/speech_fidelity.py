"""Compare requested speech with text returned by a conversational talker."""

import re
from difflib import SequenceMatcher


def _words(text: str) -> list[str]:
    return re.findall(r"[\w']+", (text or "").casefold(), re.UNICODE)


def assess(requested: str, returned: str) -> dict:
    source = _words(requested)
    output = _words(returned)
    if not source:
        return {"status": "unknown", "score": None, "coverage": None,
                "requested_words": 0, "returned_words": len(output),
                "message": "There was no source text to compare."}
    if not output:
        return {"status": "unverified", "score": None, "coverage": 0.0,
                "requested_words": len(source), "returned_words": 0,
                "message": "Alibaba returned audio without a comparison transcript."}

    matcher = SequenceMatcher(None, source, output, autojunk=False)
    matched = sum(block.size for block in matcher.get_matching_blocks())
    coverage = matched / len(source)
    precision = matched / len(output)
    score = matcher.ratio()
    status = ("pass" if coverage >= 0.98 and precision >= 0.98 else
              "warning" if coverage >= 0.90 and precision >= 0.90 else "failed")
    message = ({
        "pass": "Alibaba's returned transcript matches the requested script.",
        "warning": "Alibaba changed or omitted a small part of the requested script.",
        "failed": "Alibaba omitted or changed a substantial part of the requested script.",
    })[status]
    return {"status": status, "score": round(score, 4),
            "coverage": round(coverage, 4), "precision": round(precision, 4),
            "requested_words": len(source), "returned_words": len(output),
            "message": message}
