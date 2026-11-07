# Project maintenance rules

This is the standalone public reader. The owner has authorized publishing this project, its selected English and MP3s, and requested confirmed content-sync releases. Never change the source notebook repository's visibility or files. Never publish a raw notebook, tokens, personal paths or .local data.

For “更新英语作文播放器，按 Obsidian 最新笔记同步并发布”:
1. Read README.md and the ignored .local/sync-config.json and .local/sync-state.json. The config supplies the exact private repository/file; do not search or import unrelated notes. Use its master ref through the existing gh login.
2. Check working tree and Git origin. Preserve uncommitted user edits. Use npm run release:content; do not bypass its isolation, test, provenance or scan gates.
3. A source conflict is a stop for publication, not permission to overwrite adaptations. Read the private detailed diff and original data. Resolve only with evidence; a keep-adaptation resolution needs a reason. Preserve raw/source/example/editorial labels.
4. The incremental audio task uses the locally available Windows SAPI and Python environment. Do not generate SAPI in Linux CI or use unofficial online TTS endpoints. All changed audio must decode and be non-silent; text and byte hashes must match.
5. A release is complete only after the Actions run succeeds and the formal HTTPS resource/browser checks pass. The pipeline then records an immutable verified version tag. If tag publication is interrupted, retry scripts/tag-release.mjs with that verified commit/version; never overwrite a tag. Investigate and fix reproducible failures autonomously. Never claim a localhost check or a green build alone proves a live deployment.
6. Rehearsal branches may carry isolated synthetic English candidates; they must not run the production deploy job. Rollback is a normal forward commit from a trusted version tag. No force pushes.
7. Private mapping state must be backed up locally before synchronization. If lost, recover a verified local checkpoint; do not invent source IDs or bootstrap current curated text against a different source revision.
8. Keep UI changes small. Preserve the persistent audio element, Media Session behavior, settings, safe PWA waiting lifecycle and content-addressed resource references.
9. Report actual public URLs, version, counts, test results, update rehearsal and remaining physical-device limits. Do not send the user a list of commands to perform.

