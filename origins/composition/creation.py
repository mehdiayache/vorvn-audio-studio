"""Initial internal Create catalogue backed by existing capabilities."""

from origins.domain.creation import CreationAction, CreationField, CreationRegistry


creation_registry = CreationRegistry()

for action in (
    CreationAction(
        "generate-speech", "Generate speech",
        "Turn authored text into a voice recording.", "speech",
        inputs=(CreationField("text", "Text", "text", True),),
        output_mime_types=("audio/mpeg", "audio/wav"),
        supported_contexts=("workspace", "audiovisual-project"),
        capability_id="speech.generate",
    ),
    CreationAction(
        "generate-music", "Generate music",
        "Create a music bed or standalone track.", "stable-audio",
        inputs=(CreationField("prompt", "Prompt", "text", True),),
        parameters=(CreationField("duration", "Duration", "number", True),),
        output_mime_types=("audio/wav",),
        supported_contexts=("workspace", "audiovisual-project"),
        capability_id="music.generate",
    ),
    CreationAction(
        "generate-sound-effect", "Generate sound effect",
        "Create a focused sound effect from a description.", "stable-audio",
        inputs=(CreationField("prompt", "Prompt", "text", True),),
        parameters=(CreationField("duration", "Duration", "number", True),),
        output_mime_types=("audio/wav",),
        supported_contexts=("workspace", "audiovisual-project"),
        capability_id="sfx.generate",
    ),
    CreationAction(
        "generate-image", "Generate image",
        "Create an image with an available visual model.", "visual-generation",
        inputs=(CreationField("prompt", "Prompt", "text", True),),
        output_mime_types=("image/png", "image/jpeg", "image/webp"),
        supported_contexts=("workspace", "audiovisual-project"),
        capability_id="image.generate",
    ),
    CreationAction(
        "generate-video", "Generate video",
        "Create a video from text, images or references.", "visual-generation",
        inputs=(CreationField("prompt", "Prompt", "text", True),),
        output_mime_types=("video/mp4",),
        supported_contexts=("workspace", "audiovisual-project"),
        capability_id="video.generate",
    ),
    CreationAction(
        "create-subtitles", "Create subtitles",
        "Transcribe an audio or video File into timed captions.", "transcription",
        inputs=(CreationField("source", "Audio or video", "file", True),),
        output_mime_types=("application/x-subrip", "text/vtt"),
        supported_contexts=("workspace", "audiovisual-project"),
        capability_id="subtitle.create",
    ),
):
    creation_registry.register_action(action)
