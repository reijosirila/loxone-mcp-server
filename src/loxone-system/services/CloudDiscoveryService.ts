import { URL } from 'url';

export interface DiscoveryResult {
  miniserverId: string;
  host: string;
  port: number;
  protocol: 'http'|'https';
  wsProtocol: 'ws'|'wss';
  fullUrl: string;
}

export interface DiscoveryOptions {
  timeout?: number;
}

export class CloudDiscoveryService {
  private static readonly LOXONE_DNS_BASE = 'https://dns.loxonecloud.com';
  private static readonly DEFAULT_TIMEOUT = 5000;

  /**
   * Discovers a Loxone Miniserver using the Loxone Cloud DNS service
   * @param miniserverId The Miniserver ID (MAC address without colons)
   * @param options Discovery options
   * @returns Discovery result with the resolved address
   */
  public static async discoverMiniserver(miniserverId: string, options: DiscoveryOptions = {}) {
    const { timeout = this.DEFAULT_TIMEOUT } = options;
    // Validate miniserver ID format
    if (!this.isValidMiniserverId(miniserverId)) {
      throw new Error('Invalid Miniserver ID format');
    }
    const dnsUrl = `${this.LOXONE_DNS_BASE}/${miniserverId}`;
    const redirectUrl = await this.getRedirectUrl(dnsUrl, timeout);
    const parsedUrl = new URL(redirectUrl);
    const result: DiscoveryResult = {
      miniserverId,
      host: parsedUrl.hostname,
      port: parseInt(parsedUrl.port) || (parsedUrl.protocol === 'https:' ? 443 : 80),
      protocol: parsedUrl.protocol.replace(':', '') as "http" | "https",
      wsProtocol: parsedUrl.protocol.replace('http:', 'ws').replace('https:', 'wss') as "ws" | "wss",
      fullUrl: redirectUrl
    };
    return result;
  }

  /**
   * Gets the redirect URL from the Loxone DNS service
   */
  private static async getRedirectUrl(url: string, timeout: number): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if ([301, 302, 307].includes(response.status) && !!response.headers.get('location')) {
        return response.headers.get('location')!;
      }
      throw new Error('Loxone DNS service did not return a redirect');
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Validates Miniserver ID format (12 hex characters, MAC address without colons)
   */
  private static isValidMiniserverId(id: string): boolean {
    return /^[0-9A-Fa-f]{12}$/.test(id);
  }
}
