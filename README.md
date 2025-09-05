# Loxone MCP Server

A Model Context Protocol (MCP) server for Loxone home automation integration.

## Real-Life Usage Example

See how this MCP server integrates with Claude Desktop for smart home control: [Claude Desktop Demo](https://claude.ai/share/b6f98e57-967b-4f4f-a9fc-1b88911557b7)

Temporarily disabled ventilation and asked to analyze air quality impact and generate comprehensive indoor climate reports.

- **Lighting Control**: Adjust lights throughout your home with natural language commands
- **Audio Management**: Control multi-room audio systems and zones
- **Climate Control**: Manage ventilation, heating, and cooling systems
- **Environmental Monitoring**: Generate reports on indoor climate conditions (temperature, humidity, CO2 levels)

## Loxone Statistics Support

The MCP server supports Loxone Statistics, which aggregates historical data into smaller portions optimized for AI analysis. This allows for efficient analysis of trends and patterns in your smart home data.

- **Statistics V1**: ✅ Fully supported and tested
- **Statistics V2**: ⚠️ Supported but not yet tested

## Loxone Control Implementation Status

| Control | Implemented | Support Level | Tested |
|---------|-------------|---------------|--------|
| **Implemented Controls** | | | |
| Alarm | ✅ | Full | ❌ |
| AudioZone | ✅ | Full | ✅ |
| AudioZoneV2 | ✅ | Full | ✅ |
| Central Objects (Alarm) | ✅ | Full | ❌ |
| Central Objects (AudioZone) | ✅ | Full | ✅ |
| Central Objects (Gate) | ✅ | Full | ❌ |
| Central Objects (Jalousie) | ✅ | Full | ❌ |
| Central Objects (Window) | ✅ | Full | ❌ |
| ColorPicker | ✅ | Full | ✅ |
| ColorPickerV2 | ✅ | Full | ✅ |
| Dimmer | ✅ | Full | ✅ |
| EIBDimmer | ✅ | Full | ✅ |
| Gate | ✅ | Full | ❌ |
| InfoOnlyAnalog | ✅ | Full | ✅ |
| InfoOnlyDigital | ✅ | Full | ✅ |
| Intelligent Room Controller | ✅ | ⚠️ Partial | ❌ |
| Intelligent Room Controller v2 | ✅ | ⚠️ Partial | ✅ |
| Jalousie | ✅ | Full | ❌ |
| LightController | ✅ | Full | ✅ |
| LightControllerV2 | ✅ | Full | ✅ |
| Meter | ✅ | Full | ✅ |
| Pushbutton | ✅ | Full | ✅ |
| Radio | ✅ | Full | ✅ |
| Slider | ✅ | Full | ✅ |
| Switch | ✅ | Full | ✅ |
| TextState | ✅ | Full | ✅ |
| **Not Implemented Controls** | | | |
| AalEmergency | ❌ | - | ❌ |
| AalSmartAlarm | ❌ | - | ❌ |
| ACControl | ❌ | - | ❌ |
| AlarmChain | ❌ | - | ❌ |
| AlarmClock | ❌ | - | ❌ |
| Application | ❌ | - | ❌ |
| CarCharger | ❌ | - | ❌ |
| ClimateController | ❌ | - | ❌ |
| ClimateControllerUS | ❌ | - | ❌ |
| Daytimer | ❌ | - | ❌ |
| EnergyFlowMonitor | ❌ | - | ❌ |
| EnergyManager | ❌ | - | ❌ |
| EnergyManager2 | ❌ | - | ❌ |
| Fronius | ❌ | - | ❌ |
| Heatmixer | ❌ | - | ❌ |
| Hourcounter | ❌ | - | ❌ |
| InfoOnlyText | ❌ | - | ❌ |
| Intercom | ❌ | - | ❌ |
| IntercomV2 | ❌ | - | ❌ |
| Irrigation | ❌ | - | ❌ |
| LightsceneRGB | ❌ | - | ❌ |
| LoadManager | ❌ | - | ❌ |
| MailBox | ❌ | - | ❌ |
| MsShortcut | ❌ | - | ❌ |
| NFC Code Touch | ❌ | - | ❌ |
| PoolController | ❌ | - | ❌ |
| PowerUnit | ❌ | - | ❌ |
| PresenceDetector | ❌ | - | ❌ |
| PulseAt | ❌ | - | ❌ |
| Remote | ❌ | - | ❌ |
| Sauna | ❌ | - | ❌ |
| Sequential | ❌ | - | ❌ |
| SmokeAlarm | ❌ | - | ❌ |
| SolarPumpController | ❌ | - | ❌ |
| SpotPriceOptimizer | ❌ | - | ❌ |
| StatusMonitor | ❌ | - | ❌ |
| SteakThermo | ❌ | - | ❌ |
| SystemScheme | ❌ | - | ❌ |
| TextInput | ❌ | - | ❌ |
| TimedSwitch | ❌ | - | ❌ |
| Tracker | ❌ | - | ❌ |
| UpDownLeftRight (analog) | ❌ | - | ❌ |
| UpDownLeftRight (digital) | ❌ | - | ❌ |
| ValueSelector | ❌ | - | ❌ |
| Ventilation | ❌ | - | ❌ |
| Wallbox2 | ❌ | - | ❌ |
| WallboxManager | ❌ | - | ❌ |
| Webpage | ❌ | - | ❌ |
| Window | ❌ | - | ❌ |
| WindowMonitor | ❌ | - | ❌ |

### Adding New Controls

Implementing new controls is straightforward using the `AbstractControlType` base class. Each control type follows a consistent pattern, making it easy to add support for additional Loxone controls.

📚 **Official Documentation**: [Loxone Structure File Documentation](https://www.loxone.com/wp-content/uploads/datasheets/StructureFile.pdf)

**Contributions are welcome!** If you need a control that's not yet implemented, feel free to submit a pull request.

### Miniserver Version Support

- **Miniserver v1**: ✅ Fully supported (local and remote connections)
- **Miniserver v2**: ⚠️ Local connection only
  - v2 should work but is not fully tested
  - Remote connection to v2 is not currently supported due to SSL encryption requirements
  - The underlying client library (`loxone-ts-api`) doesn't have SSL support implemented yet

🙏 **Special thanks** to the [loxone-ts-api](https://github.com/andrasg/loxone-ts-api/tree/main) library for providing the foundation for Loxone communication!

## Supported MCP Transports

- **Stdio**: ✅ Fully supported (used with Claude Desktop)
- **Streamable HTTP**: 🚧 Coming soon

## Connection Options

- Connect directly to your Miniserver using its local IP address.

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

### Running with Claude Desktop

To use this MCP server with Claude Desktop, add the following to your Claude configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`  
**Linux:** `~/.config/claude/claude_desktop_config.json`

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
        "loxone-mcp-server"
      ],
      "env": {
        "LOXONE_HOST": "your-loxone-ip",
        "LOXONE_USERNAME": "your-username",
        "LOXONE_PASSWORD": "your-password"
      }
    }
  }
}
```

### Environment Variables

Create a `.env` file with your Loxone credentials:

```env
LOXONE_HOST=192.168.1.100
LOXONE_USERNAME=admin
LOXONE_PASSWORD=your-password

# or if you are connecting over the internet using loxone DNS
# this will auto discovery loxone external url and port and tries to connect there
# LOXONE_SERIAL_NUMBER=
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

- Node.js 22+
- npm
- TypeScript

### Installation

```bash
# Installation
npm install
# Build
npm run build
# Run
npm start
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
