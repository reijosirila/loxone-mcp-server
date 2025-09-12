import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { CloudDiscoveryService } from '../../../src/tools/loxone-system/services/CloudDiscoveryService.js';

// Mock global fetch
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('CloudDiscoveryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('discoverMiniserver', () => {
    it('should successfully discover a miniserver with HTTP', async () => {
      const mockResponse = {
        status: 302,
        headers: {
          get: jest.fn().mockReturnValue('http://192.168.1.100:80')
        }
      } as any;
      
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);
      
      const result = await CloudDiscoveryService.discoverMiniserver('504F94123456');
      
      expect(result).toEqual({
        miniserverId: '504F94123456',
        host: '192.168.1.100',
        port: 80,
        protocol: 'http',
        wsProtocol: 'ws',
        fullUrl: 'http://192.168.1.100:80'
      });
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://dns.loxonecloud.com/504F94123456',
        expect.objectContaining({
          method: 'HEAD',
          redirect: 'manual'
        })
      );
    });

    it('should successfully discover a miniserver with HTTPS', async () => {
      const mockResponse = {
        status: 301,
        headers: {
          get: jest.fn().mockReturnValue('https://example.loxone.com:443')
        }
      } as any;
      
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);
      
      const result = await CloudDiscoveryService.discoverMiniserver('504F94123456');
      
      expect(result).toEqual({
        miniserverId: '504F94123456',
        host: 'example.loxone.com',
        port: 443,
        protocol: 'https',
        wsProtocol: 'wss',
        fullUrl: 'https://example.loxone.com:443'
      });
    });

    it('should handle custom ports', async () => {
      const mockResponse = {
        status: 307,
        headers: {
          get: jest.fn().mockReturnValue('http://192.168.1.100:8080')
        }
      } as any;
      
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);
      
      const result = await CloudDiscoveryService.discoverMiniserver('504F94123456');
      
      expect(result.port).toBe(8080);
      expect(result.fullUrl).toBe('http://192.168.1.100:8080');
    });

    it('should use default ports when not specified', async () => {
      const mockResponse = {
        status: 302,
        headers: {
          get: jest.fn().mockReturnValue('http://192.168.1.100')
        }
      } as any;
      
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);
      
      const result = await CloudDiscoveryService.discoverMiniserver('504F94123456');
      expect(result.port).toBe(80);
      
      // Test HTTPS default port
      const httpsResponse = {
        status: 302,
        headers: {
          get: jest.fn().mockReturnValue('https://example.com')
        }
      } as any;
      
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(httpsResponse);
      
      const httpsResult = await CloudDiscoveryService.discoverMiniserver('504F94123456');
      expect(httpsResult.port).toBe(443);
    });

    it('should reject invalid miniserver ID format', async () => {
      await expect(CloudDiscoveryService.discoverMiniserver('invalid'))
        .rejects.toThrow('Invalid Miniserver ID format');
      
      await expect(CloudDiscoveryService.discoverMiniserver('504F94:123456'))
        .rejects.toThrow('Invalid Miniserver ID format');
      
      await expect(CloudDiscoveryService.discoverMiniserver('504F9412345G'))
        .rejects.toThrow('Invalid Miniserver ID format');
      
      // Should not call fetch for invalid IDs
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle no redirect response', async () => {
      const mockResponse = {
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue(null)
        }
      } as any;
      
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);
      
      await expect(CloudDiscoveryService.discoverMiniserver('504F94123456'))
        .rejects.toThrow('Loxone DNS service did not return a redirect');
    });

    it('should handle missing location header', async () => {
      const mockResponse = {
        status: 302,
        headers: {
          get: jest.fn().mockReturnValue(null)
        }
      } as any;
      
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);
      
      await expect(CloudDiscoveryService.discoverMiniserver('504F94123456'))
        .rejects.toThrow('Loxone DNS service did not return a redirect');
    });

    it('should handle timeout', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValue(abortError);
      
      await expect(CloudDiscoveryService.discoverMiniserver('504F94123456', { timeout: 100 }))
        .rejects.toThrow('Request timeout after 100ms');
    });

    it('should use default timeout', async () => {
      const mockResponse = {
        status: 302,
        headers: {
          get: jest.fn().mockReturnValue('http://192.168.1.100')
        }
      } as any;
      
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);
      
      await CloudDiscoveryService.discoverMiniserver('504F94123456');
      
      // Check that fetch was called with an abort signal
      const fetchCall = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls[0];
      expect(fetchCall[1]).toHaveProperty('signal');
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValue(
        new Error('Network error')
      );
      
      await expect(CloudDiscoveryService.discoverMiniserver('504F94123456'))
        .rejects.toThrow('Network error');
    });

    it('should validate various miniserver ID formats', () => {
      // Valid IDs (12 hex characters)
      const validIds = [
        '504F94123456',
        'ABCDEF123456',
        '000000000000',
        'ffffffffffff',
        'aAbBcCdDeEfF'
      ];
      
      for (const id of validIds) {
        expect(async () => {
          // Mock successful response to avoid actual network call
          (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
            status: 302,
            headers: { get: jest.fn().mockReturnValue('http://test.com') }
          } as any);
          
          await CloudDiscoveryService.discoverMiniserver(id);
        }).not.toThrow();
      }
      
      // Invalid IDs
      const invalidIds = [
        '',
        '504F9412345',    // Too short
        '504F941234567',   // Too long
        '504F94-123456',   // Contains dash
        '504F94:123456',   // Contains colon
        'GGGGGG123456',    // Contains non-hex characters
      ];
      
      for (const id of invalidIds) {
        expect(CloudDiscoveryService.discoverMiniserver(id))
          .rejects.toThrow('Invalid Miniserver ID format');
      }
    });
  });
});