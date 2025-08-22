/**
 * Web Automation Pattern for MCP
 * 
 * Demonstrates how agents can use MCP web automation tools (Puppeteer)
 * for web scraping, automation, and data extraction tasks.
 */

import { MCPToolGateway } from '@starships/core';
import { DynamicTool } from '@langchain/core/tools';

export interface WebNavigationOptions {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  timeout?: number;
}

export interface ScreenshotOptions {
  fullPage?: boolean;
  quality?: number;
  type?: 'png' | 'jpeg';
}

export interface WebAutomationPattern {
  navigate(url: string, options?: WebNavigationOptions): Promise<boolean>;
  screenshot(path: string, options?: ScreenshotOptions): Promise<string>;
  click(selector: string): Promise<boolean>;
  type(selector: string, text: string): Promise<boolean>;
  evaluate(script: string): Promise<any>;
  getContent(): Promise<string>;
}

/**
 * MCP Web Automation Pattern Implementation
 */
export class MCPWebAutomationPattern implements WebAutomationPattern {
  private gateway: MCPToolGateway;
  private starshipId: string;

  constructor(gateway: MCPToolGateway, starshipId: string) {
    this.gateway = gateway;
    this.starshipId = starshipId;
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string, options?: WebNavigationOptions): Promise<boolean> {
    try {
      const result = await this.gateway.invokeTool(
        this.starshipId,
        'navigate',
        {
          url,
          ...options
        }
      );

      return result.success;
    } catch (error) {
      console.error('[MCPWebAutomation] Navigation failed:', error);
      return false;
    }
  }

  /**
   * Take a screenshot
   */
  async screenshot(path: string, options?: ScreenshotOptions): Promise<string> {
    try {
      const result = await this.gateway.invokeTool(
        this.starshipId,
        'screenshot',
        {
          path,
          ...options
        }
      );

      return result.success ? path : '';
    } catch (error) {
      console.error('[MCPWebAutomation] Screenshot failed:', error);
      return '';
    }
  }

  /**
   * Click an element
   */
  async click(selector: string): Promise<boolean> {
    try {
      const result = await this.gateway.invokeTool(
        this.starshipId,
        'click',
        {
          selector
        }
      );

      return result.success;
    } catch (error) {
      console.error('[MCPWebAutomation] Click failed:', error);
      return false;
    }
  }

  /**
   * Type text into an element
   */
  async type(selector: string, text: string): Promise<boolean> {
    try {
      const result = await this.gateway.invokeTool(
        this.starshipId,
        'type',
        {
          selector,
          text
        }
      );

      return result.success;
    } catch (error) {
      console.error('[MCPWebAutomation] Type failed:', error);
      return false;
    }
  }

  /**
   * Evaluate JavaScript in the page context
   */
  async evaluate(script: string): Promise<any> {
    try {
      const result = await this.gateway.invokeTool(
        this.starshipId,
        'evaluate',
        {
          script
        }
      );

      return result.success ? result.result : null;
    } catch (error) {
      console.error('[MCPWebAutomation] Evaluate failed:', error);
      return null;
    }
  }

  /**
   * Get page content
   */
  async getContent(): Promise<string> {
    try {
      const result = await this.gateway.invokeTool(
        this.starshipId,
        'content',
        {}
      );

      return result.success ? result.result : '';
    } catch (error) {
      console.error('[MCPWebAutomation] Get content failed:', error);
      return '';
    }
  }
}

/**
 * Common web automation patterns
 */
export class WebAutomationPatterns {
  private automation: MCPWebAutomationPattern;

  constructor(automation: MCPWebAutomationPattern) {
    this.automation = automation;
  }

  /**
   * Extract structured data from a webpage
   */
  async extractData(url: string, selectors: Record<string, string>): Promise<Record<string, any>> {
    // Navigate to the page
    const navigated = await this.automation.navigate(url, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    if (!navigated) {
      throw new Error(`Failed to navigate to ${url}`);
    }

    // Extract data using selectors
    const extractionScript = `
      const selectors = ${JSON.stringify(selectors)};
      const data = {};
      
      for (const [key, selector] of Object.entries(selectors)) {
        const element = document.querySelector(selector);
        if (element) {
          data[key] = element.textContent.trim();
        }
      }
      
      return data;
    `;

    return await this.automation.evaluate(extractionScript);
  }

  /**
   * Fill and submit a form
   */
  async fillForm(
    url: string,
    formData: Record<string, string>,
    submitSelector: string
  ): Promise<boolean> {
    // Navigate to the page
    const navigated = await this.automation.navigate(url);
    if (!navigated) return false;

    // Fill form fields
    for (const [selector, value] of Object.entries(formData)) {
      const typed = await this.automation.type(selector, value);
      if (!typed) {
        console.error(`Failed to fill field: ${selector}`);
        return false;
      }
    }

    // Submit the form
    return await this.automation.click(submitSelector);
  }

  /**
   * Take screenshots of multiple pages
   */
  async capturePages(
    urls: string[],
    outputDir: string
  ): Promise<Record<string, string>> {
    const screenshots: Record<string, string> = {};

    for (const url of urls) {
      const navigated = await this.automation.navigate(url, {
        waitUntil: 'networkidle0'
      });

      if (navigated) {
        const filename = `${outputDir}/${url.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.png`;
        const path = await this.automation.screenshot(filename, {
          fullPage: true
        });

        if (path) {
          screenshots[url] = path;
        }
      }
    }

    return screenshots;
  }

  /**
   * Monitor a webpage for changes
   */
  async monitorPageChanges(
    url: string,
    selector: string,
    interval: number = 60000
  ): Promise<AsyncGenerator<any>> {
    let previousContent: string | null = null;

    const automation = this.automation;
    const monitor = async function* () {
      while (true) {
        await automation.navigate(url);
        
        const currentContent = await automation.evaluate(`
          document.querySelector('${selector}')?.textContent || ''
        `);

        if (previousContent !== null && currentContent !== previousContent) {
          yield {
            timestamp: new Date().toISOString(),
            previousContent,
            currentContent,
            changed: true
          };
        }

        previousContent = currentContent;
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }

    return monitor.call(this);
  }

  /**
   * Extract table data
   */
  async extractTable(
    url: string,
    tableSelector: string
  ): Promise<any[][]> {
    await this.automation.navigate(url);

    const tableData = await this.automation.evaluate(`
      const table = document.querySelector('${tableSelector}');
      if (!table) return [];
      
      const rows = Array.from(table.querySelectorAll('tr'));
      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        return cells.map(cell => cell.textContent.trim());
      });
    `);

    return tableData || [];
  }

  /**
   * Download files from links
   */
  async downloadFiles(
    url: string,
    linkSelector: string,
    downloadDir: string
  ): Promise<string[]> {
    await this.automation.navigate(url);

    // Get all download links
    const links = await this.automation.evaluate(`
      Array.from(document.querySelectorAll('${linkSelector}'))
        .map(link => link.href)
        .filter(href => href);
    `);

    const downloadedFiles: string[] = [];

    for (const link of links) {
      // Note: Actual download implementation would require additional MCP tools
      // This is a placeholder showing the pattern
      console.log(`Would download: ${link} to ${downloadDir}`);
      downloadedFiles.push(link);
    }

    return downloadedFiles;
  }

  /**
   * Perform search and extract results
   */
  async searchAndExtract(
    searchUrl: string,
    searchInputSelector: string,
    searchButtonSelector: string,
    searchQuery: string,
    resultSelector: string
  ): Promise<any[]> {
    // Navigate to search page
    await this.automation.navigate(searchUrl);

    // Enter search query
    await this.automation.type(searchInputSelector, searchQuery);

    // Click search button
    await this.automation.click(searchButtonSelector);

    // Wait for results
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract results
    const results = await this.automation.evaluate(`
      Array.from(document.querySelectorAll('${resultSelector}')).map(element => ({
        title: element.querySelector('h3')?.textContent || '',
        description: element.querySelector('p')?.textContent || '',
        link: element.querySelector('a')?.href || ''
      }));
    `);

    return results || [];
  }
}

/**
 * Create web automation tools for agents
 */
export function createWebAutomationTools(
  gateway: MCPToolGateway,
  starshipId: string
): DynamicTool[] {
  const automation = new MCPWebAutomationPattern(gateway, starshipId);
  const patterns = new WebAutomationPatterns(automation);

  return [
    new DynamicTool({
      name: 'web_navigate',
      description: 'Navigate to a webpage',
      func: async (input: string) => {
        try {
          const { url, waitUntil } = JSON.parse(input);
          const success = await automation.navigate(url, { waitUntil });
          return success 
            ? `Successfully navigated to ${url}`
            : `Failed to navigate to ${url}`;
        } catch (error) {
          return `Error: Invalid input. Expected JSON with 'url' and optional 'waitUntil'.`;
        }
      }
    }),

    new DynamicTool({
      name: 'web_screenshot',
      description: 'Take a screenshot of the current page',
      func: async (input: string) => {
        try {
          const { path, fullPage } = JSON.parse(input);
          const screenshotPath = await automation.screenshot(path, { fullPage });
          return screenshotPath 
            ? `Screenshot saved to ${screenshotPath}`
            : 'Failed to take screenshot';
        } catch (error) {
          return `Error: Invalid input. Expected JSON with 'path' and optional 'fullPage'.`;
        }
      }
    }),

    new DynamicTool({
      name: 'web_extract_data',
      description: 'Extract data from a webpage using CSS selectors',
      func: async (input: string) => {
        try {
          const { url, selectors } = JSON.parse(input);
          const data = await patterns.extractData(url, selectors);
          return JSON.stringify(data);
        } catch (error) {
          return `Error: Invalid input. Expected JSON with 'url' and 'selectors' object.`;
        }
      }
    }),

    new DynamicTool({
      name: 'web_fill_form',
      description: 'Fill and submit a web form',
      func: async (input: string) => {
        try {
          const { url, formData, submitSelector } = JSON.parse(input);
          const success = await patterns.fillForm(url, formData, submitSelector);
          return success 
            ? 'Form submitted successfully'
            : 'Failed to submit form';
        } catch (error) {
          return `Error: Invalid input. Expected JSON with 'url', 'formData', and 'submitSelector'.`;
        }
      }
    }),

    new DynamicTool({
      name: 'web_extract_table',
      description: 'Extract table data from a webpage',
      func: async (input: string) => {
        try {
          const { url, tableSelector } = JSON.parse(input);
          const tableData = await patterns.extractTable(url, tableSelector);
          return JSON.stringify(tableData);
        } catch (error) {
          return `Error: Invalid input. Expected JSON with 'url' and 'tableSelector'.`;
        }
      }
    })
  ];
}