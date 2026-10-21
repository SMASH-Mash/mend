# Mend demo video: voice-over script

The recorded walkthrough (`hearth/demo/mend-demo.mp4`, 1:38, 1080p) is silent, with captions. The AI responses are live and unscripted (Gemini through Strands Agents), and AI waiting time is shortened in the video, as its title card says. Re-record it with `npm run record` in `hearth/` while Mend and Hearth are running.

A human voice-over makes it much stronger. Read each line when its moment arrives.

| Time | On screen | Say |
|---|---|---|
| 0:00 | Card: "You can't scroll a phone with wet hands…" | "Most broken appliances need a twenty-minute fix, not a new machine. But you can't scroll a phone with wet hands inside a dishwasher." |
| 0:06 | Card: Mend | "Mend is hands-free repair for Alexa+. It's an MCP server on the 2025-11-25 spec, and it's running here in Hearth, our open-source Alexa+ simulator." |
| 0:14 | Hearth home screen | "On the left is a simulated Echo Show. On the right, every MCP message as it happens." |
| 0:17 | "Alexa, my dishwasher won't drain…" | "I just describe the problem in my own words." |
| 0:22 | Guides screen | "Mend checks my appliance passport, so it knows this is a Bosch, and finds the iFixit guide for my exact model." |
| 0:27 | "Yes, let's do the easy one." → overview | "It tells me how long it takes, the tools I need, and the risks it will check." |
| 0:35 | "Okay, next." → safety check | "Before the first step, Mend asks *me* whether the power is off. This is MCP elicitation: the question goes to the person, so the AI can't answer it for me." |
| 0:43 | "Yes, it's unplugged." → step 1 | "Each step is read aloud with the real photo from the guide." |
| 0:51 | Tap on Next | "I can also just tap, and the voice assistant stays in sync." |
| 0:57 | "Next." | "One step at a time, read exactly as the guide says. No improvising." |
| 1:02 | "It's draining now. It's fixed!" | "When it works, Mend logs the repair and resets the maintenance clock." |
| 1:10 | "What maintenance is due?" | "It remembers my home: the fridge coils are overdue." |
| 1:18 | "Add a new drain pump…" → approval | "If I need a part, it goes in my cart only after I approve it. Every purchase, every time." |
| 1:25 | "Yes, add it." → cart | "That's Mend: MCP 2025-11-25, MCP Apps screens, elicitation and an Agent Skill." |
| 1:36 | Outro card | "Mend and Hearth are open source. Thanks for watching." |

## Adding your voice and publishing

1. Open **Clipchamp** (built into Windows 11; free in the Microsoft Store on Windows 10) and import `hearth/demo/mend-demo.mp4`.
2. **Record & create → Audio**: record the lines above while the video plays.
3. Export at 1080p and upload to **YouTube** as *Public* or *Unlisted*. The rules require a public YouTube or Vimeo link, under 3 minutes.
