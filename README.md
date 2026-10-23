# Loxone MCP Server

A Model Context Protocol (MCP) server for Loxone home automation integration.

## Real-Life Usage Example

See how this MCP server integrates with Claude Desktop for smart home control: [Claude Desktop Demo](https://claude.ai/share/b6f98e57-967b-4f4f-a9fc-1b88911557b7)

Temporarily disabled ventilation and asked to analyze air quality impact and generate comprehensive indoor climate reports.

- **Lighting Control**: Adjust lights throughout your home with natural language commands
- **Audio Management**: Control multi-room audio systems and zones
- **Climate Control**: Manage ventilation, heating, and cooling systems
- **Environmental Monitoring**: Generate reports on indoor climate conditions (temperature, humidity, CO2 levels)

## Quick usage guide

### Using npm package

Node.js 22.1 or newer is required (Node 24 LTS is recommended and used by the Docker image).

First install the package globally:

```bash
npm install -g @reijosirila/loxone-mcp-server
```

Add to your Claude `claude_desktop_config.json` or any other MCP client config:

```json
{
  "mcpServers": {
    "loxone": {
      "command": "loxone-mcp-server",
      "env": {
        "LOXONE_HOST": "192.168.1.100",
        "LOXONE_USERNAME": "your-username",
        "LOXONE_PASSWORD": "your-password"
      }
    }
  }
}
```

#### Using Docker Hub image

First pull the image:

```bash
docker pull reijosirila/loxone-mcp-server
```

Then add to your Claude `claude_desktop_config.json` or any other MCP client config:

```json
{
  "mcpServers": {
    "loxone": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-e", "LOXONE_HOST",
        "-e", "LOXONE_USERNAME",
        "-e", "LOXONE_PASSWORD",
        "reijosirila/loxone-mcp-server"
      ],
      "env": {
        "LOXONE_HOST": "192.168.1.100",
        "LOXONE_USERNAME": "your-username",
        "LOXONE_PASSWORD": "your-password"
      }
    }
  }
}
```


## Available Tools

| Tool | Purpose |
|------|---------|
| `getSystemInfo` | Miniserver name, project, location, units, current operating mode, sunrise/sunset, connection state and control counts per type |
| `getRooms` / `getCategories` | Rooms and categories with the number of controls in each |
| `getControls` | Compact list of controls (uuid, type, room, one-line state summary, command names). Filter by `room`, `category` (UUID or name), `type` or free-text `search`; pass `detailed: true` for full state details |
| `getControl` | Full state values and commands (with value ranges and options) of one control |
| `setControl` | Send a command (`on`, `off`, `setValue`, `setTemperature`, `up`, `down`, ...). Returns the Miniserver response and the refreshed control state |
| `getStatistics` | Aggregated historical data for controls with statistics enabled; predefined periods or a custom `from`/`to` range, optional output column for multi-output statistics |
| `reloadStructure` | Re-download the structure file after changes in Loxone Config, without restarting |

Tools carry MCP annotations (`readOnlyHint` etc.), so clients can auto-approve read-only calls. Tool failures (unknown control, invalid command, rejected by the Miniserver) are returned as readable tool errors, including the list of valid commands, so the assistant can correct itself.

Every control in the structure file is visible: types without a dedicated implementation are exposed read-only through a generic control with best-effort state formatting.

## Loxone Statistics Support

The MCP server supports Loxone Statistics, which aggregates historical data into smaller portions optimized for AI analysis. This allows for efficient analysis of trends and patterns in your smart home data.

- **Statistics V1**: ✅ Fully supported and tested (Gen1 Miniservers included: large monthly files, controller-local timezone, multi-output files)
- **Statistics V2** (meters, Energy Flow Monitor): ✅ Supported and tested against a live Miniserver. Power outputs return average/min/max per bucket; meters also return the energy used per bucket (`consumption`, the counter difference) and `consumption.total`. `valueDescription` names the unit of each value, and `output` selects any output listed in `outputs`
- Custom time windows: pass ISO `from`/`to` to `getStatistics`; the aggregation level (minute, hour, day, month) is chosen from the span

## Loxone Control Implementation Status

| Control | Implemented | Support Level | Tested |
|---------|-------------|---------------|--------|
| **Implemented Controls** | | | |
| Alarm | ✅ | Full | ❌ |
| AlarmClock | ✅ | snooze, dismiss | ❌ |
| AudioZone | ✅ | Full | ✅ |
| AudioZoneV2 | ✅ | Full | ✅ |
| Central Objects (Alarm) | ✅ | Full | ❌ |
| Central Objects (AudioZone) | ✅ | Full | ✅ |
| Central Objects (Gate) | ✅ | Full | ❌ |
| Central Objects (Jalousie) | ✅ | Full | ❌ |
| Central Objects (Window) | ✅ | Full | ❌ |
| ColorPicker | ✅ | Full | ✅ |
| ColorPickerV2 | ✅ | Full | ✅ |
| Daytimer | ✅ | Read-only (current output, override) | ❌ |
| Dimmer | ✅ | Full | ✅ |
| EIBDimmer | ✅ | Full | ✅ |
| EnergyFlowMonitor | ✅ | Read-only | ✅ |
| EnergyManager2 | ✅ | Read-only | ❌ |
| Fronius | ✅ | Read-only | ❌ |
| Gate | ✅ | Full | ❌ |
| Hourcounter | ✅ | Read-only | ❌ |
| InfoOnlyAnalog | ✅ | Read-only | ✅ |
| InfoOnlyDigital | ✅ | Read-only | ✅ |
| InfoOnlyText | ✅ | Read-only | ❌ |
| Intelligent Room Controller | ✅ | ⚠️ Partial | ❌ |
| Intelligent Room Controller v2 | ✅ | ⚠️ Partial | ✅ |
| Intercom | ✅ | answer | ❌ |
| IntercomV2 | ✅ | Read-only | ❌ |
| Jalousie | ✅ | Full | ❌ |
| LightController | ✅ | Full | ✅ |
| LightControllerV2 | ✅ | Full (moods, individual lights, colors) | ✅ |
| LoadManager | ✅ | Read-only | ❌ |
| MailBox | ✅ | confirmPacket, confirmMail | ❌ |
| Meter | ✅ | Read-only | ✅ |
| PresenceDetector | ✅ | Read-only | ❌ |
| Pushbutton | ✅ | Full | ✅ |
| Radio | ✅ | Full | ✅ |
| Sauna | ✅ | Full | ❌ |
| Slider | ✅ | Full | ✅ |
| SmokeAlarm | ✅ | mute, quit | ❌ |
| Switch | ✅ | Full | ✅ |
| TextState | ✅ | Read-only | ✅ |
| TimedSwitch | ✅ | pulse, on, off | ❌ |
| Tracker | ✅ | Read-only | ❌ |
| ValueSelector / UpDownAnalog / LeftRightAnalog / UpDownLeftRightAnalog | ✅ | setValue with range check | ❌ |
| Ventilation | ✅ | Read-only | ❌ |
| WindowMonitor | ✅ | Read-only (per-window states) | ❌ |
| AalSmartAlarm / AalEmergency | ✅ | Read-only (deliberately) | ❌ |
| **Generic (read-only state, no commands)** | | | |
| ACControl | ⚠️ generic | Read-only | ❌ |
| AlarmChain | ⚠️ generic | Read-only | ❌ |
| Application | ⚠️ generic | Read-only | ❌ |
| CarCharger | ⚠️ generic | Read-only | ❌ |
| ClimateController | ⚠️ generic | Read-only | ❌ |
| ClimateControllerUS | ⚠️ generic | Read-only | ❌ |
| EnergyManager | ⚠️ generic | Read-only | ❌ |
| Heatmixer | ⚠️ generic | Read-only | ❌ |
| Irrigation | ⚠️ generic | Read-only | ❌ |
| LightsceneRGB | ⚠️ generic | Read-only | ❌ |
| MsShortcut | ⚠️ generic | Read-only | ❌ |
| NFC Code Touch | ⚠️ generic | Read-only | ❌ |
| PoolController | ⚠️ generic | Read-only | ❌ |
| PowerUnit | ⚠️ generic | Read-only | ❌ |
| PulseAt | ⚠️ generic | Read-only | ❌ |
| Remote | ⚠️ generic | Read-only | ❌ |
| Sequential | ⚠️ generic | Read-only | ❌ |
| SolarPumpController | ⚠️ generic | Read-only | ❌ |
| SpotPriceOptimizer | ⚠️ generic | Read-only | ❌ |
| StatusMonitor | ⚠️ generic | Read-only | ❌ |
| SteakThermo | ⚠️ generic | Read-only | ❌ |
| SystemScheme | ⚠️ generic | Read-only | ❌ |
| TextInput | ⚠️ generic | Read-only | ❌ |
| UpDownLeftRight (digital) | ⚠️ generic | Read-only | ❌ |
| Wallbox2 | ⚠️ generic | Read-only | ❌ |
| WallboxManager | ⚠️ generic | Read-only | ❌ |
| Webpage | ⚠️ generic | Read-only | ❌ |
| Window | ⚠️ generic | Read-only | ❌ |

### Adding New Controls

Implementing new controls is straightforward using the `AbstractControlType` base class. Each control type follows a consistent pattern, making it easy to add support for additional Loxone controls.

📚 **Loxone Official Documentation**: [Loxone Structure File Documentation](https://www.loxone.com/wp-content/uploads/datasheets/StructureFile.pdf)

**Contributions are welcome!** If you need a control that's not yet implemented, feel free to submit a pull request.

### Miniserver Version Support

- **Miniserver Gen. 1**: ✅ Fully supported (local and remote connections)
- **Miniserver Gen. 2 / Compact / Go**: ✅ Supported locally and remotely over HTTPS (`loxone-ts-api` 2.x). Set `LOXONE_HOST` to the full URL, e.g. `https://my-miniserver.example:443`, or use `LOXONE_PROTOCOL=https`.
- Requires Miniserver firmware 11.2 or newer.
- The connection is kept alive and re-established automatically; after a reconnect the structure is reloaded if it changed.

🙏 **Special thanks** to the [loxone-ts-api](https://github.com/andrasg/loxone-ts-api/tree/main) library for providing the foundation for Loxone communication!

## Supported MCP Transports

- **Stdio**: ✅ Fully supported
- **HTTP**: ✅ Fully supported (Express server with `/mcp` endpoint)

The transport can be configured using the `MCP_TRANSPORT` environment variable:

- `stdio` (default): Standard input/output transport
- `http`: HTTP server with Streamable HTTP support at `/mcp` endpoint

## Connection Options

- Connect directly to your Miniserver using its local IP address, hostname or full base URL (`http://` or `https://`).

- Connect to your Miniserver remotely using Loxone's cloud discovery service:
  - Automatically discovers your Miniserver's external URL and port using its serial number. This is done using HEAD request to: `https://dns.loxonecloud.com/<sn>`
  - Loxone External Access must be enabled.

## Local Docker Setup

### Building the Docker Image

```bash
git clone git@github.com:reijosirila/loxone-mcp-server.git
cd loxone-mcp-server
docker build -t loxone-mcp-server .
```

### Environment Variables

You can also create a `.env` file with your Loxone credentials and configuration:

```env
# Loxone connection settings
LOXONE_HOST=192.168.1.100
LOXONE_USERNAME=admin
LOXONE_PASSWORD=your-password

# Optional: port (default 80 for http, 443 for https) and protocol (http or https)
# LOXONE_PORT=80
# LOXONE_PROTOCOL=http

# Or connect over the internet using Loxone DNS
# This will auto-discover Loxone external URL and port
# LOXONE_SERIAL_NUMBER=

# How long startup waits for the Miniserver before failing (default 30000 ms)
# LOXONE_CONNECT_TIMEOUT_MS=30000

# MCP Transport configuration
# Options: stdio (default), http
MCP_TRANSPORT=stdio

# HTTP server port (only used when MCP_TRANSPORT=http)
# Default: 3000
PORT=3000

# Log level (0=ERROR, 1=WARN, 2=INFO, 3=DEBUG)
# Default: 1 for stdio, 2 for http
LOG_LEVEL=2
```

### Alternative: Running without Docker

If you prefer to run without Docker, you can use Node.js directly:

```json
{
  "mcpServers": {
    "loxone": {
      "command": "node",
      "args": ["dist/server.js"],
      "cwd": "/path/to/loxone-mcp-server",
      "env": {
        "LOXONE_HOST": "your-loxone-ip",
        "LOXONE_USERNAME": "your-username",
        "LOXONE_PASSWORD": "your-password"
      }
    }
  }
}
```

## Development

### Prerequisites

- Node.js 22.1+ (24 LTS recommended)
- npm
- TypeScript

### Installation

```bash
# Installation
npm install

# Build
npm run build

# Run with stdio transport (default)
npm start

# Run with HTTP transport
MCP_TRANSPORT=http npm start
# or
npm run start:http

# Development mode
npm run dev          # stdio transport
npm run dev:http     # Streamable HTTP transport
```

### Testing with Claude Code

The repository ships a project-scoped `.mcp.json`, so starting `claude` in this directory offers the `loxone` server automatically (Claude Code asks once to approve project servers; `claude mcp reset-project-choices` resets that). The entry rebuilds `dist/` and launches the server over stdio, reading the Miniserver credentials from `.env`:

```bash
cp .env.example .env   # or create .env with LOXONE_HOST / LOXONE_USERNAME / LOXONE_PASSWORD
claude                 # then: /mcp to see the server status, or just ask "what rooms do I have?"
```

`claude mcp list` shows the server outside a session. Startup includes cloud discovery and the initial state download, so allow a few seconds; raise `MCP_TIMEOUT` (milliseconds) if your Miniserver is slow to reach.

### Running the tests

```bash
npm test               # unit tests (jest)
npm run lint
npm run inspect        # MCP Inspector against the TypeScript sources
```

### Streamable HTTP Transport Usage

When using Streamable HTTP transport, the server listens on port 3000 by default (configurable via `PORT` or `MCP_PORT` environment variable):

- **MCP Endpoint**: `http://localhost:3000/mcp`
- **Health Check**: `http://localhost:3000/health` (no authentication required)

#### API Key Authentication

The Streamable HTTP server supports optional API key authentication via the `MCP_API_KEY` environment variable:

```bash
# Set API key for secure access
MCP_API_KEY=your-secure-api-key-here MCP_TRANSPORT=http npm start
```

When configured, the API key can be provided in two ways:

1. **Bearer Token**: `Authorization: Bearer your-secure-api-key-here`
2. **X-API-Key Header**: `X-API-Key: your-secure-api-key-here`

If `MCP_API_KEY` is not set, the server will be publicly accessible (useful for development or when behind a reverse proxy).

#### Internet Access Security

⚠️ **Important**: If you're exposing the HTTP server over the internet, always use SSL offload with a reverse proxy (e.g., nginx) to secure the connection.

Example Claude Desktop/Gemini configuration for HTTP transport:

```json
{
  "mcpServers": {
    "loxone-http": {
      "httpUrl": "http://localhost:3000/mcp",
      "description": "Loxone Smart Home MCP Server (HTTP)"
    }
  }
}
```

Example with API key authentication (when connecting to a remote server):

```json
{
  "mcpServers": {
    "loxone-http-secure": {
      "httpUrl": "https://your-server.com/mcp",
      "headers": {
        "Authorization": "Bearer your-secure-api-key-here"
      },
      "description": "Loxone Smart Home MCP Server (Secure HTTP)"
    }
  }
}
```

Or using X-API-Key header:

```json
{
  "mcpServers": {
    "loxone-http-secure": {
      "httpUrl": "https://your-server.com/mcp",
      "headers": {
        "X-API-Key": "your-secure-api-key-here"
      },
      "description": "Loxone Smart Home MCP Server (Secure HTTP)"
    }
  }
}
```

## License

This software is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

### Important License Terms

- ✅ **Free to use** for personal and commercial purposes
- ✅ **Modifications allowed** and encouraged
- ⚠️ **Source code must be shared** when:
  - You distribute the software
  - You use it as a network service (SaaS)
  - You modify and deploy it commercially

For the full license text, see the [LICENSE](LICENSE) file.

## Contributing

Contributions are welcome! By contributing to this project, you agree to license your contributions under the AGPL-3.0 license.

## Support

For issues, feature requests, or questions, please open an issue on GitHub.
