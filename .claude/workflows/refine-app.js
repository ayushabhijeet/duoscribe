export const meta = {
  name: 'refine-app',
  description: 'One on-demand cycle: research a high-value next feature, implement it, verify with the eval suite, open a PR for human review',
  whenToUse: "Invoke by name whenever you want Duoscribe's feature set to move forward without deciding what to build yourself. Never auto-merges -- always stops at an open PR for a human to review.",
  phases: [
    { title: 'Research', detail: 'survey the app + past PRs, propose one well-scoped feature' },
    { title: 'Implement', detail: 'build it, extend the eval suite, verify, open a PR if green' },
  ],
}

const REPO_PATH = '/Users/ayushabhijeet/Documents/md-viewer'
const REPO_SLUG = 'ayushabhijeet/duoscribe'

const RESEARCH_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    rationale: { type: 'string' },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
    implementationNotes: { type: 'string' },
    versionBump: { type: 'string', enum: ['patch', 'minor'] },
  },
  required: ['title', 'rationale', 'acceptanceCriteria', 'versionBump'],
}

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    shipped: { type: 'boolean' },
    prUrl: { type: 'string' },
    summary: { type: 'string' },
    evalOutput: { type: 'string' },
  },
  required: ['shipped', 'summary'],
}

const RESEARCH_PROMPT = `You are working in the git repository at ${REPO_PATH} -- Duoscribe, an open-source (MIT) Electron markdown viewer/editor with side-by-side raw/rendered panes, public at https://github.com/${REPO_SLUG}.

Your job THIS RUN: propose exactly ONE well-scoped next feature or improvement. Do not implement anything -- research and propose only.

Before proposing, build real context so you don't suggest something already done or already tried:
- Read README.md and CHANGELOG.md in full for the current feature list and version history.
- Run "gh pr list --repo ${REPO_SLUG} --state all --limit 100" and skim titles/bodies of past PRs (gh pr view <n> --repo ${REPO_SLUG} for ones whose title is unclear) so you know what's already shipped, and anything that was tried and reverted or abandoned.
- Read main.js, preload.js, renderer.js, index.html, styles.css so you understand the actual current architecture (contextBridge/IPC pattern between preload and main, the CSS custom-property theming system, the existing keyboard-shortcut listener, the command palette, the outline panel, etc.) rather than assuming.
- Look at scripts/eval-app.js and scripts/fixtures/eval.md to see what's already covered by the automated eval suite.

What makes a good proposal for this project specifically:
- Genuinely useful to someone editing markdown day to day -- not a token gesture.
- Scoped to something one focused implementation pass can build well (not "rewrite the editor" or "add a plugin system").
- Has a concrete, testable acceptance criterion or two -- something that could plausibly be checked by driving the running app via Chrome DevTools Protocol and asserting on real DOM state (that's how this project's eval suite works; look at scripts/eval-app.js for the pattern). If a feature is pure visual polish with nothing programmatically assertable, that's a signal to pick something else or narrow the scope until part of it is testable.
- Consistent with what this app already is: a small, fast, unbundled markdown editor -- not "become Obsidian" or "become VS Code."

Call the StructuredOutput tool with:
- title: short feature name
- rationale: 2-4 sentences on why this is worth building next, referencing what you actually found (not generic reasoning)
- acceptanceCriteria: 2-5 concrete, ideally-testable statements of what must be true when done
- implementationNotes: your best sketch of which files need to change and how, grounded in the actual code you read -- the next agent has no memory of this research and will rely entirely on what you write here
- versionBump: "minor" for a new user-facing feature, "patch" for a fix/refinement to something existing`

function buildImplementPrompt(proposal) {
  return `You are working in the git repository at ${REPO_PATH} -- Duoscribe, an open-source Electron markdown editor, public at https://github.com/${REPO_SLUG}. A research pass (no memory of this conversation, you're starting fresh) proposed the following, which you are now implementing:

TITLE: ${proposal.title}

RATIONALE: ${proposal.rationale}

ACCEPTANCE CRITERIA:
${proposal.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}

IMPLEMENTATION NOTES FROM RESEARCH (a sketch, not gospel -- verify against the actual current code yourself, it may already be stale):
${proposal.implementationNotes || '(none provided)'}

Read main.js, preload.js, renderer.js, index.html, and styles.css IN FULL before changing anything -- match existing patterns exactly, don't invent new ones. Key architecture facts: contextIsolation is true / nodeIntegration is false, so the renderer can only reach main via the window.mdViewer bridge (contextBridge in preload.js, ipcMain.handle in main.js); the theme system is entirely CSS custom properties on :root, redefined under a prefers-color-scheme media query and a :root[data-theme] override, never hardcoded colors; there's a global keydown listener in renderer.js for shortcuts (check it carefully for collisions before adding a new one -- this project has hit real shortcut collisions before); there's a command palette (buildPaletteCommands() in renderer.js) that most actions should probably get an entry in.

Work on a new branch (git checkout -b, pick a descriptive kebab-case name).

Once implemented:
1. Extend scripts/eval-app.js (and scripts/fixtures/eval.md if the feature needs new fixture content) with new assertions covering this feature's acceptance criteria -- follow the existing section()/assert() pattern in that file exactly. This is not optional: the eval suite is this project's only regression net, and it's supposed to grow with every feature. Pick real, specific DOM/state assertions, not vague ones.
2. Run "npm run eval" (may need PATH=/usr/local/opt/node@20/bin:$PATH prepended if the system node is too old -- check node -v first, this environment sometimes has a stale default node) and iterate until it exits 0. Budget real effort here -- fix actual bugs your implementation has, don't weaken assertions to force a pass.
3. If, after genuine effort, npm run eval still fails: STOP. Do not commit, push, or open a PR. Run "git checkout main" and "git branch -D <your-branch>" to leave the repo clean, then call StructuredOutput with shipped: false, a clear summary of what you built and why it's not passing, and the eval output.
4. If eval passes: bump package.json's version (${proposal.versionBump} bump over whatever the current version is), add a CHANGELOG.md entry under a new version heading, add a one-line README.md feature bullet if this is user-facing, commit everything (implementation + eval suite extension + docs + version bump) on your branch, push it, and open a PR with "gh pr create" -- title should be the feature name, body should explain what it does and reference the acceptance criteria. Do NOT attempt to approve or merge it; a human reviews and merges every PR this project ships, no exceptions expected or wanted here.

Call the StructuredOutput tool with: shipped (boolean), prUrl (the PR URL if shipped, omit/empty if not), summary (what you built or why you stopped), evalOutput (the last eval run's output, trimmed to what's relevant).`
}

phase('Research')
const proposal = await agent(RESEARCH_PROMPT, {
  label: 'research-next-feature',
  phase: 'Research',
  schema: RESEARCH_SCHEMA,
})

log(`Proposed: ${proposal.title}`)

phase('Implement')
const result = await agent(buildImplementPrompt(proposal), {
  label: 'implement-and-ship',
  phase: 'Implement',
  schema: RESULT_SCHEMA,
})

if (result.shipped) {
  log(`Shipped: ${result.prUrl}`)
} else {
  log(`Not shipped this cycle: ${result.summary}`)
}

return { proposal, result }
