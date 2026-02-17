# Nex as a Skill for OpenClaw

Give your OpenClaw agent a Context Graph.

## What is Nex?

Nex is a real-time context layer for AI agents. It builds a Context Graph from your conversations and shares organizational context with your agents. This skill allows OpenClaw agents to:

- **Query context** - Ask natural language questions about your contacts and companies
- **Add context** - Process conversation transcripts to extract entities and insights
- **Stream insights** - (Coming soon) Receive real-time notifications when new insights are discovered

## Installation

### Prerequisites

- [OpenClaw](https://github.com/openclaw/openclaw) installed and configured
- A Nex account with Developer API access

### Step 1: Get Your API Key

1. Log in to [Nex](https://app.nex.ai)
2. Go to **Settings > Developer**
3. Create a new API key with the following scopes:
   - `record.read` - For querying context
   - `record.write` - For processing text

### Step 2: Install the Skill

#### Option A: Manual Installation

1. Create the skill directory:
   ```bash
   mkdir -p ~/.openclaw/workspace/skills/nex
   ```

2. Copy `SKILL.md` to the directory:
   ```bash
   cp SKILL.md ~/.openclaw/workspace/skills/nex/
   ```

#### Option B: Clone Repository

```bash
git clone https://github.com/nex-crm/nex-as-a-skill.git
cp nex-as-a-skill/SKILL.md ~/.openclaw/workspace/skills/nex/
```

### Step 3: Configure Your API Key

Add your API key to `~/.openclaw/openclaw.json`:

```json
{
  "skills": {
    "entries": {
      "nex": {
        "enabled": true,
        "env": {
          "NEX_API_KEY": "nex_dev_your_key_here"
        }
      }
    }
  }
}
```

### Step 4: Verify Installation

Start OpenClaw and check that the skill is loaded:

```bash
openclaw agent --message "What skills do you have?"
```

The agent should list "nex" among its available skills.

## Usage Examples

### Query Context

```
You: What do I know about Acme Corp?

OpenClaw: [Uses Nex skill to query context]
Based on your context graph, Acme Corp is a technology company you've been
working with for 3 months. Key contacts include John Smith (VP Sales) and
Sarah Chen (CTO). Recent activity shows discussions about their APAC expansion.
```

### Add Context

```
You: I just had a call with John. He mentioned they're closing their Series B
next month and plan to hire 50 engineers.

OpenClaw: [Uses Nex skill to process text]
I've added this context to your graph. Created/updated:
- John (contact) - linked to Series B and hiring plans
- Added insight: Acme Corp closing Series B next month
- Added insight: Acme Corp planning to hire 50 engineers
```

## API Documentation

See [docs.nex.ai](https://docs.nex.ai) for full API documentation.

## Support

- GitHub Issues: [nex-crm/nex-as-a-skill/issues](https://github.com/nex-crm/nex-as-a-skill/issues)
- OpenClaw Discord: #nex-skill channel

## License

MIT License - see [LICENSE](LICENSE)
