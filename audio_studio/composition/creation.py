"""Initial internal Create catalogue backed by existing capabilities."""

from audio_studio.domain.creation import CreationAction, CreationField, CreationRegistry


creation_registry = CreationRegistry()

for action in (
    CreationAction(
        "generate-speech", "Generate speech",
        "Turn authored text into a voice recording.", "speech",
        inputs=(CreationField("text", "Text", "text", True),),
        output_mime_types=("audio/mpeg", "audio/wav"),
        supported_contexts=("space", "audiovisual-project"), composer="speech",
    ),
    CreationAction(
        "generate-music", "Generate music",
        "Create a music bed or standalone track.", "stable-audio",
        inputs=(CreationField("prompt", "Prompt", "text", True),),
        parameters=(CreationField("duration", "Duration", "number", True),),
        output_mime_types=("audio/wav",),
        supported_contexts=("space", "audiovisual-project"), composer="music",
    ),
    CreationAction(
        "generate-sound-effect", "Generate sound effect",
        "Create a focused sound effect from a description.", "stable-audio",
        inputs=(CreationField("prompt", "Prompt", "text", True),),
        parameters=(CreationField("duration", "Duration", "number", True),),
        output_mime_types=("audio/wav",),
        supported_contexts=("space", "audiovisual-project"), composer="sound-effect",
    ),
    CreationAction(
        "generate-image", "Generate image",
        "Create an image with an available visual model.", "visual-generation",
        inputs=(CreationField("prompt", "Prompt", "text", True),),
        output_mime_types=("image/png", "image/jpeg", "image/webp"),
        supported_contexts=("space", "audiovisual-project"), composer="image",
    ),
    CreationAction(
        "generate-video", "Generate video",
        "Create a video from text, images or references.", "visual-generation",
        inputs=(CreationField("prompt", "Prompt", "text", True),),
        output_mime_types=("video/mp4",),
        supported_contexts=("space", "audiovisual-project"), composer="video",
    ),
    CreationAction(
        "create-subtitles", "Create subtitles",
        "Transcribe an audio or video File into timed captions.", "transcription",
        inputs=(CreationField("source", "Audio or video", "file", True),),
        output_mime_types=("application/x-subrip", "text/vtt"),
        supported_contexts=("space", "audiovisual-project"), composer="subtitles",
    ),
):
    creation_registry.register_action(action)
