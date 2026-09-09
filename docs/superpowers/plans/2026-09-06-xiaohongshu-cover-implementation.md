# Xiaohongshu Woodcut Buffalo Cover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a restrained 1242 × 1660 px Xiaohongshu cover featuring a retro woodcut water buffalo, accurate Chinese copy, and generous top and bottom safe areas.

**Architecture:** Generate a fresh single-raster composition rather than modifying the advertising-style v1. Inspect the composition and text at full resolution, resize to the exact delivery dimensions, and apply deterministic text correction only when a generated character is inaccurate. Preserve v1 and save the new local-only asset as v2.

**Tech Stack:** Built-in image generation, local image inspection, macOS image resizing, optional deterministic typography overlay.

---

### Task 1: Generate the woodcut buffalo cover

**Files:**
- Read: `docs/superpowers/specs/2026-09-06-xiaohongshu-cover-design.md`
- Create: `assets/social/who-cite-your-works-xiaohongshu-cover-v2.png`

- [x] **Step 1: Generate a fresh 3:4 editorial cover**

Generate one mature, calm water buffalo reading or examining a research paper. Use charcoal-black woodcut linework, aged ivory paper, and restrained deep-red accents. Keep the title as the first visual layer and the buffalo as the second. Keep the top and bottom 12% free of essential content. Do not use recognizable people, logos, QR codes, watermarks, fake application interfaces, glossy effects, neon lighting, or a promotional call-to-action button.

- [x] **Step 2: Render only the approved copy**

Use exactly these strings and no other visible text:

```text
哪些大佬
引用了你的
论文？
985 / 211 / 双一流 · 院士 / Fellow · 引用原文
已上传至 GitHub
```

Render `已上传至 GitHub` as a small editorial annotation or stamp rather than a button.

- [x] **Step 3: Save the selected image locally**

Resize the selected image to exactly 1242 × 1660 px and save it as `assets/social/who-cite-your-works-xiaohongshu-cover-v2.png`. Do not overwrite v1 and do not add the social cover to Git.

### Task 2: Validate and finalize

**Files:**
- Inspect: `assets/social/who-cite-your-works-xiaohongshu-cover-v2.png`

- [x] **Step 1: Inspect the full-resolution image**

Confirm the 3:4 aspect ratio, visible top and bottom safe areas, readable title hierarchy, mature woodcut water-buffalo character, accurate Chinese text, restrained academic-magazine tone, and absence of watermarks or unintended people.

- [x] **Step 2: Correct text only if necessary**

If any generated character is wrong, preserve the artwork and overlay the five approved strings with a deterministic Chinese font. Do not introduce extra labels, buttons, usernames, statistics, or repository URLs.

- [x] **Step 3: Verify the final file**

Run an image metadata check and reopen the final PNG. Expected result: 1242 × 1660 px, readable approved copy, safe margins, no accidental cropping, and a visibly less promotional tone than v1.
