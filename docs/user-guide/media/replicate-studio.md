# Replicate Studio

The **Replicate Studio** (`Media → Replicate`) is a native, browser-based generative media workspace. It connects to [Replicate](https://replicate.com) using your own API token and runs models for images, video, audio, and speech — without leaving Postmill.

> Verified against v3.8.10

---

## What `/media/replicate` is

The studio exposes 18 generation categories in a single page:

| Category | Kind | Typical use |
|---|---|---|
| Text-to-image | Image | Generate photos, illustrations, or concept art from a prompt. |
| Image-to-image | Image | Transform or restyle an existing image. |
| Inpainting | Image | Edit a region of an image with a hand-painted mask. |
| Upscale | Image | Increase resolution of an existing image. |
| Background removal | Image | Remove the background of an image. |
| Text-to-video | Video | Generate a video from a prompt. |
| Image-to-video | Video | Animate an existing image into a video. |
| Video-to-video | Video | Transform an existing video with a style or effect. |
| Caption | Video | Add captions/subtitles to a video. |
| Text-to-speech (TTS) | Audio | Convert text to spoken audio. |
| Speech-to-text (STT) | Text | Transcribe an audio file to text. |
| Voice clone | Audio | Clone a voice from a short audio sample. |
| Music generation | Audio | Generate music from a prompt. |
| Music-to-music | Audio | Transform or extend an existing music clip. |
| Meme | Image | Add draggable text layers to an image and export a PNG. |
| Merge | Video | Combine up to 6 video clips with transitions into one MP4. |

Every run uses the org's own Replicate token, configured in **Settings → Media Providers**.

---

## Warm vs community models and cost badges

Each category lists **warm** official models by default. Warm models are pre-loaded by Replicate and start faster; the cost shown in the badge is fixed per run.

- **Instant** badge — a warm, output-priced model. The cost bar shows an estimate before you click **Generate**.
- **Community** badge — a community model priced by compute time. Turn on the **Show community models** toggle to see them. Community runs are billed by the second and the cost bar shows a usage-based estimate.

Select a model to reveal its dynamic input form. Required fields are marked; optional fields can be left at their defaults.

---

## Save-folder requirement for async video/audio jobs

Video and audio generations (including caption) run asynchronously. Before generating, choose a **Save folder** in the Files library. The finished asset is imported into that folder automatically when the job completes.

If no folder is selected, the **Generate** button is disabled and a message prompts you to pick one.

Image runs are synchronous by default. If Replicate queues the prediction, the studio registers an async job and polls until completion; the same save-folder rule applies.

---

## STT transcripts are Copy + Download only

**Speech-to-text** runs synchronously and returns the transcript inline. You can:

- **Copy** the full text to the clipboard.
- **Download** the transcript as `.txt` or `.srt`.

STT results are not saved to Files and do not consume media credits.

---

## Inpaint mask painter

The inpaint workflow has two inputs:

1. **Source image** — pick an image from Files or provide a public `https` URL.
2. **Mask** — paint over the area you want to change with the brush tool. Use the eraser to refine. The exported mask is a black-and-white PNG where white pixels are the region to regenerate.

Adjust the brush size, then click **Use this mask** to return to the generation form. The source and mask are sent together to the selected inpainting model.

---

## Video merge

The merge editor lets you combine up to 6 clips into one MP4:

1. Click **Add clip** and choose a video from Files or paste a public `https` URL.
2. Re-order clips by dragging the list items.
3. Pick a transition and duration for each gap between clips.
4. Select a save folder and click **Merge**.

The job runs server-side via ffmpeg. When it completes, the merged video appears in the selected Files folder and can be opened directly from the result panel.

---

## Meme generator

The meme editor is a native canvas tool:

1. Pick a base image from Files or a public `https` URL.
2. Add draggable text layers. Each layer has its own font, size, color, outline, and style (bold/italic).
3. Drag text to position it on the canvas.
4. Click **Export** to save the meme as a PNG to Files, then **Open in Designer** to refine it further.

---

## Related docs

- [Media Library](../media-library.md) — folder tree, uploads, and storage routing.
- [AI Tools](../ai-tools.md) — text generation, brand voice, and spend controls.
- [Settings](../settings.md) — configuring the Replicate media provider.
