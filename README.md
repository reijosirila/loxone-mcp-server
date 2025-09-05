# Loxone MCP Server

A Model Context Protocol (MCP) server for Loxone home automation integration.

## Docker Setup

### Building the Docker Image

```bash
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
        "run",
        "--rm",
        "-i",
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

# or if you are connecting using loxone DNS
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
      "args": ["dist/index.js"],
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

- Node.js 20+
- npm or yarn
- TypeScript

### Installation

```bash
npm install
```

### Build

```bash
npm run build
```

### Run

```bash
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