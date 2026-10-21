# Mend: Devpost submission (Build, Ship, Shape: Amazon Developer Hackathon)

> Copy each section into the matching Devpost field. Replace `<…>` placeholders before submitting.

**Project name:** Mend: hands-free repair for Alexa+

**Elevator pitch:** "Alexa, my dishwasher won't drain." Mend walks you through the fix one step at a time, by voice, with photos on the Echo Show. It asks *you*, not the AI, to confirm the power is off before risky steps, and it remembers your appliances, warranties and maintenance. It's an MCP server (spec 2025-11-25) with MCP Apps screens and elicitation, plus Hearth, an open-source Alexa+ simulator to try it.

**Primary track:** Alexa+: a self-hosted MCP server implementing MCP spec 2025-11-25 over Streamable HTTP, demonstrated through a simulated Alexa+ experience (Hearth).

**Mini challenges:** AWS Builder (Strands Agents SDK) · Open Source (Hearth)

**Links**
- Project repository (Mend): `https://github.com/SMASH-Mash/mend`
- Open-source contribution (Hearth): `https://github.com/SMASH-Mash/hearth`
- Demo video: `<YouTube link>`
- GitHub username: `SMASH-Mash`

---

## Inspiration

Every home has a dishwasher that won't drain, a fridge that hums too loud or a washer that smells. Usually the fix is a 20-minute cleaning or a $15 part. Instead, people pay for a callout or buy a new machine. The world generated **62 million tonnes of e-waste in 2022**, and only **22.3%** was documented as recycled (UN Global E-waste Monitor 2024).

Great repair guides already exist (iFixit has tens of thousands), but you can't scroll a phone with wet hands halfway inside a dishwasher. A voice assistant with a screen is the right tool for repair, *if* it's safe, specific to your appliance, and remembers your home. Alexa+ can finally connect to tools through MCP, so we built that tool.

## What it does

Mend is a hands-free repair assistant for Alexa+:

1. **Knows your home.** An appliance passport stores your appliances (Bosch SHEM78WH5N dishwasher, Samsung fridge…), their warranties, repair history and maintenance schedule, across sessions.
2. **Finds the right fix.** "There's water in the bottom" becomes "drain filter / drain pump" searches over iFixit. The guide for your exact model ranks first.
3. **One step at a time.** "Next", "repeat", "go back". Short spoken instructions, with the step photo, progress and cautions on the Echo Show screen. You can also tap.
4. **Safety the AI can't fake.** Before any step involving electricity, water, gas, a battery or refrigerant, Mend asks *the person directly* through MCP **elicitation**, for example "Is the dishwasher switched off and unplugged?", and waits. The model can't answer for them. Mains appliances always get a power check, even when the guide forgets. Refrigerant work stops with a referral to a technician.
5. **Finishes the loop.** It logs the repair, resets the maintenance clock and reminds you what's due next ("vacuum the fridge coils"). If the fix didn't work, it checks your warranty before suggesting a part.
6. **Purchases with consent.** It adds the replacement part to your Amazon cart only after you approve it through elicitation. The cart is simulated in this prototype and creates exact-part Amazon searches.

We also built **Hearth**, an open-source, voice-first MCP host that simulates Alexa+ on an Echo Show, because there was no way to try any of this without a device. It speaks, listens, renders MCP Apps, asks elicitation questions by voice and shows an inspector of every MCP message.

## How we built it

- **Mend (MCP server, Node.js):**
  - The official MCP TypeScript SDK v2 (`@modelcontextprotocol/server` and `node`), negotiating protocol **2025-11-25**. The integration test asserts it.
  - **Streamable HTTP with stateful sessions**, so the server can elicit in the middle of a tool call.
  - 10 tools with annotations, structured results and 1–3 sentence spoken text.
  - Server instructions, resources, a prompt and an **Agent Skill** (`SKILL.md`).
  - An **MCP App** (`ui://mend/screen.html`) built with the official `@modelcontextprotocol/ext-apps` SDK. It shows guides, step photos, safety checks, passport, cart and maintenance. It declares a strict CSP and calls tools on touch.
- **Safety layer:** hazard detection on every step's text, plus appliance-level pre-checks. Each critical hazard is confirmed once per repair. Clients without elicitation fall back to a spoken check instead of skipping it.
- **iFixit integration:** a symptom-to-repair-term mapper, multi-query search, ranking by exact model, difficulty and photos, caching, and bundled offline guides.
- **Hearth (simulated Alexa+):**
  - A Node backend running one **Strands Agents** agent per device session, connected to Mend with Strands' `McpClient`. Elicitation requests are bridged to the device.
  - The agent uses Google Gemini's free tier. OpenAI-compatible and Amazon Bedrock providers are also supported.
  - A browser front end with the Web Speech API for listening and speaking, the official MCP Apps **AppBridge** in a sandboxed iframe, an elicitation sheet you answer by voice or touch, an Alexa-style light bar and an inspector.
- **Quality:**
  - Mend: 18 tests, including a full MCP session over HTTP that runs a repair, declines and then accepts a safety check, and approves a purchase.
  - Hearth: 6 tests.
  - Browser end-to-end checks of the device flow.

## Challenges we ran into

- **Safety the model can't bypass.** A tool parameter like `powerIsOff: true` would let the model "confirm" for the person. Elicitation sends the question to the human instead, which needs stateful sessions and a host that can ask by voice.
- **Natural language vs repair search.** iFixit search returns nothing for "water at the bottom", so we mapped symptoms to repair vocabulary and ranked candidates by the appliance's exact model.
- **MCP Apps on a voice device.** The screen and the conversation must stay in sync. Touching "Next" on the screen calls the tool through the host and also tells the voice agent what happened (`updateModelContext`).
- **Tooling gaps** (detailed in the friction log): Strands drops `structuredContent`, an AppBridge init-order pitfall, inlining the MCP Apps SDK into a single-file `ui://` resource, and the lack of a way to test an MCP server on a real Alexa+ device.

## Accomplishments that we're proud of

- A complete, working voice-and-screen repair flow on real iFixit guides, with real photos.
- Safety and purchase consent that go to the human by design, not by prompt.
- An MCP server that renders on a simulated Echo Show *and* in any MCP Apps–capable client.
- Hearth, which any Alexa+ developer can use today to hear and see their MCP server.

## What we learned

- Elicitation and MCP Apps are what make MCP feel native on voice devices: one asks the person, the other shows them.
- Voice UX is mostly subtraction: 1–3 sentences, one step at a time, and let the screen carry the details.
- Building the host taught us the protocol from both sides. Every pitfall we hit is in the friction log.

## What's next

- Connect Mend to Alexa+ natively as soon as self-hosted MCP servers can be added.
- Account linking per household, a real cart, and repair cafés or certified technicians when a fix isn't DIY.
- Camera diagnosis on the Echo Show ("show me the error code").
- Publish Hearth's MCP Apps host as a reusable package.

---

## Product feedback

### MCP TypeScript SDK v2 (`@modelcontextprotocol/server`, `node`, `client`)
- **Used for:** Mend's server (tools, resources, prompts, instructions, elicitation, Streamable HTTP sessions) and the test client.
- **Worked well:** `registerTool` with Zod schemas and `structuredContent`; `ctx.mcpReq.elicitInput()` inside handlers; `NodeStreamableHTTPServerTransport` with session callbacks; `client.getNegotiatedProtocolVersion()` for asserting 2025-11-25 in tests.
- **Needs work:** Most tutorials still use the v1 `@modelcontextprotocol/sdk` package, but MCP Apps 2.x needs the v2 split packages, so we started on the wrong one. The 2026-07-28 deprecation notes inside the v2 types (elicitation moving to `input_required`) are easy to miss.
- **Onboarding:** about one hour to a working Streamable HTTP server, mostly spent finding the v2 import paths.
- **Would build again:** **Yes.** The server API is clean, and elicitation over Streamable HTTP worked the first time.

### MCP Apps (`@modelcontextprotocol/ext-apps` 2.x)
- **Used for:** Mend's Echo Show screen (`App`, `registerAppTool`, `registerAppResource`), and Hearth's host (`AppBridge`, `PostMessageTransport`).
- **Worked well:** The View/host split is well designed. `ontoolresult`, `callServerTool` and `updateModelContext` covered everything a voice-plus-touch device needs. CSP metadata on resources is a great security story.
- **Needs work:** There's no single-file or IIFE build for self-contained `ui://` HTML (we rewrote the ESM export of `app-with-deps.js`, 418 KB). `setHostContext()` before `connect()` causes an unhandled "Not connected" error. The README says there's no supported host implementation, which is the gap Hearth fills.
- **Onboarding:** a few hours, including the host side.
- **Would build again:** **Yes.** It's the missing piece for smart displays.

### Strands Agents SDK (TypeScript)
- **Used for:** Hearth's agent loop: `Agent`, `McpClient` with `elicitationCallback`, streaming events (`modelStreamUpdateEvent`, `before/afterToolCallEvent`, `modelMessageEvent`) and the Google Gemini model provider. A Bedrock provider is also wired in.
- **Worked well:** Passing an `McpClient` directly as a tool source; elicitation support (form and URL); typed stream events that map neatly to a device UI; swapping model providers in one line.
- **Needs work:** `McpTool` maps only `content` into `ToolResultBlock` and drops `structuredContent` and `_meta`, so an MCP Apps host built on Strands can't get the screen data from agent events. We wrapped `McpClient.callTool` as a workaround.
- **Onboarding:** under an hour from install to an agent calling Mend's tools.
- **Would build again:** **Yes.** It was the fastest way to put a real agent behind a simulated device, and it's provider-agnostic.

### Alexa+ (MCP integration)
- **Used for:** the target platform. Mend follows the Alexa+ track's MCP requirements (2025-11-25, Streamable HTTP, self-hosted).
- **Needs work:** We found no way to connect a self-hosted MCP server to an Alexa+ device or account to test voice, screen (MCP Apps) and elicitation behavior. That's why we built Hearth.
- **Would build again:** **Yes.** MCP makes Alexa+ skills dramatically simpler to build. We'd love a test console.

---

## Friction log

| # | Task attempted | Steps taken | Expected | Actual | Severity | Workaround | Suggestion |
|---|---|---|---|---|---|---|---|
| 1 | Show a tool's MCP App screen from a Strands agent | Passed `McpClient` to `Agent`; listened to `afterToolCallEvent` for the result | The tool result keeps `structuredContent` and `_meta`, so the host can hand them to the View | `McpTool` converts only `content` into a `ToolResultBlock`; `structuredContent`/`_meta` are dropped | High (blocks MCP Apps hosts on Strands) | Wrapped `mcpClient.callTool` to capture the raw `CallToolResult` | Keep `structuredContent` as a `JsonBlock` or expose the raw MCP result on `afterToolCallEvent`; first-class MCP Apps support |
| 2 | Initialize an MCP Apps View with host context | `new AppBridge(…)`, then `setHostContext({...})`, then `connect()` | Context stored for `ui/initialize` | Unhandled rejection: "Not connected" | Medium | Pass `{ hostContext }` in the constructor options | Make `setHostContext` a no-op notify before connect, or document the ordering |
| 3 | Ship a self-contained `ui://` HTML resource | Inlined `app-with-deps.js` into a `<script type="module">` | A bundle usable inline (IIFE/global) | ESM bundle ends with `export{…}`, unusable inline as-is | Medium | Rewrote the export clause into a local object at build time | Publish an IIFE build (`window.McpApps`) and a smaller View-only bundle |
| 4 | Build an MCP Apps server with the familiar SDK | Started with `@modelcontextprotocol/sdk` 1.x | ext-apps server helpers work with it | ext-apps 2.x peers on the v2 split packages | Low | Migrated to `@modelcontextprotocol/server`, `node`, `client` v2 | Call out the v1→v2 requirement in the ext-apps quickstart |
| 5 | Test the MCP server on Alexa+ | Looked for a way to add a self-hosted MCP URL to a device or test console | Voice and screen testing of tools, elicitation and MCP Apps | No path found | High (for this track) | Built Hearth, an open-source simulator | An Alexa+ developer console that accepts an MCP URL, with Echo Show screen and elicitation support |

## Feature requests

| Request | Why it matters to Mend | Priority |
|---|---|---|
| Alexa+ test console that connects a self-hosted MCP server URL | So we can test voice, screen and safety confirmations on the real platform | Critical |
| Strands: raw MCP results (incl. `structuredContent`/`_meta`) on tool events | So MCP Apps screens can be driven from a Strands agent without patching | Important |
| MCP Apps: official IIFE/global View bundle | Simplest possible single-file `ui://` resources | Nice-to-have |

---

## Testing instructions (for judges)

```bash
# 1) Mend (MCP server)
git clone https://github.com/SMASH-Mash/mend && cd mend
npm install && npm test && npm start                 # http://127.0.0.1:8787/mcp

# 2) Hearth (simulated Alexa+), in a second terminal
git clone https://github.com/SMASH-Mash/hearth && cd hearth
npm install && cp .env.example .env                  # add a free GEMINI_API_KEY
npm start                                            # open http://localhost:5180 in Chrome
```

Say or type *"Alexa, my dishwasher won't drain."* No key? Type `/tool find_repair_guides {"device":"dishwasher","problem":"won't drain"}` to drive Mend's screens directly.
