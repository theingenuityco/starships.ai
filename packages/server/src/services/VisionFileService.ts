import fs from 'fs/promises';
import path from 'path';

export class VisionFileService {
  private static readonly VISION_DIR = path.join(process.cwd(), 'data', 'visions');
  
  // Read vision file
  static async readVision(starshipId: string): Promise<string | null> {
    const filePath = path.join(this.VISION_DIR, `${starshipId}.txt`);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content.trim();
    } catch {
      return null;
    }
  }
  
  // Write vision file
  static async writeVision(starshipId: string, content: string): Promise<void> {
    await fs.mkdir(this.VISION_DIR, { recursive: true });
    const filePath = path.join(this.VISION_DIR, `${starshipId}.txt`);
    await fs.writeFile(filePath, content.trim(), 'utf8');
  }
  
  // Create empty vision file
  static async createEmptyVision(starshipId: string): Promise<void> {
    const exists = await this.visionExists(starshipId);
    if (!exists) {
      await this.writeVision(starshipId, '');
    }
  }
  
  // Check if vision file exists
  static async visionExists(starshipId: string): Promise<boolean> {
    const filePath = path.join(this.VISION_DIR, `${starshipId}.txt`);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  // Check if vision has content
  static async hasVisionContent(starshipId: string): Promise<boolean> {
    const vision = await this.readVision(starshipId);
    return vision !== null && vision.trim().length > 0;
  }
}