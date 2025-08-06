import { VisionFileService } from '../../src/services/VisionFileService';
import * as fs from 'fs-extra';
import * as path from 'path';

// Mock fs-extra
jest.mock('fs-extra');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock return types for jest functions
const mockReadFile = mockFs.readFile as jest.MockedFunction<typeof fs.readFile>;
const mockWriteFile = mockFs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
const mockEnsureDir = mockFs.ensureDir as jest.MockedFunction<typeof fs.ensureDir>;
const mockAccess = mockFs.access as jest.MockedFunction<typeof fs.access>;

// Mock path.join to return predictable paths
jest.mock('path', () => ({
  join: jest.fn((...paths) => paths.join('/')),
}));

// Mock process.cwd
const originalCwd = process.cwd;

describe('VisionFileService', () => {
  const mockStarshipId = 'test-starship-123';
  const mockVisionDir = 'test-cwd/data/visions';
  const mockFilePath = `${mockVisionDir}/${mockStarshipId}.txt`;

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock process.cwd to return consistent value
    process.cwd = jest.fn(() => 'test-cwd');
  });

  afterEach(() => {
    process.cwd = originalCwd;
  });

  describe('readVision', () => {
    it('should read vision file content', async () => {
      const mockContent = '  Test vision content  ';
      mockReadFile.mockResolvedValue(mockContent);

      const result = await VisionFileService.readVision(mockStarshipId);

      expect(mockReadFile).toHaveBeenCalledWith(mockFilePath, 'utf8');
      expect(result).toBe('Test vision content'); // Should be trimmed
    });

    it('should return null when file does not exist', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const result = await VisionFileService.readVision(mockStarshipId);

      expect(result).toBeNull();
    });

    it('should return null when file read fails', async () => {
      mockReadFile.mockRejectedValue(new Error('Permission denied'));

      const result = await VisionFileService.readVision(mockStarshipId);

      expect(result).toBeNull();
    });

    it('should handle empty file content', async () => {
      mockReadFile.mockResolvedValue('');

      const result = await VisionFileService.readVision(mockStarshipId);

      expect(result).toBe('');
    });

    it('should trim whitespace from content', async () => {
      mockReadFile.mockResolvedValue('\n  \n  Vision content  \n  \n');

      const result = await VisionFileService.readVision(mockStarshipId);

      expect(result).toBe('Vision content');
    });
  });

  describe('writeVision', () => {
    it('should write vision content to file', async () => {
      const mockContent = '  Test vision content  ';
      mockEnsureDir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await VisionFileService.writeVision(mockStarshipId, mockContent);

      expect(mockEnsureDir).toHaveBeenCalledWith(mockVisionDir);
      expect(mockWriteFile).toHaveBeenCalledWith(
        mockFilePath,
        'Test vision content', // Should be trimmed
        'utf8'
      );
    });

    it('should create directory if it does not exist', async () => {
      mockEnsureDir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await VisionFileService.writeVision(mockStarshipId, 'content');

      expect(mockEnsureDir).toHaveBeenCalledWith(mockVisionDir);
    });

    it('should trim content before writing', async () => {
      mockEnsureDir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await VisionFileService.writeVision(mockStarshipId, '\n  \n  Test content  \n  \n');

      expect(mockWriteFile).toHaveBeenCalledWith(
        mockFilePath,
        'Test content',
        'utf8'
      );
    });

    it('should handle write errors', async () => {
      mockEnsureDir.mockResolvedValue(undefined);
      mockWriteFile.mockRejectedValue(new Error('Write failed'));

      await expect(VisionFileService.writeVision(mockStarshipId, 'content'))
        .rejects.toThrow('Write failed');
    });

    it('should handle directory creation errors', async () => {
      mockEnsureDir.mockRejectedValue(new Error('Directory creation failed'));

      await expect(VisionFileService.writeVision(mockStarshipId, 'content'))
        .rejects.toThrow('Directory creation failed');
    });
  });

  describe('createEmptyVision', () => {
    it('should create empty vision file when it does not exist', async () => {
      // Mock visionExists to return false
      mockAccess.mockRejectedValue(new Error('File not found'));
      mockEnsureDir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await VisionFileService.createEmptyVision(mockStarshipId);

      expect(mockAccess).toHaveBeenCalledWith(mockFilePath);
      expect(mockEnsureDir).toHaveBeenCalledWith(mockVisionDir);
      expect(mockWriteFile).toHaveBeenCalledWith(mockFilePath, '', 'utf8');
    });

    it('should not create file when it already exists', async () => {
      // Mock visionExists to return true
      mockAccess.mockResolvedValue(undefined);

      await VisionFileService.createEmptyVision(mockStarshipId);

      expect(mockAccess).toHaveBeenCalledWith(mockFilePath);
      expect(mockFs.ensureDir).not.toHaveBeenCalled();
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('visionExists', () => {
    it('should return true when file exists', async () => {
      mockAccess.mockResolvedValue(undefined);

      const result = await VisionFileService.visionExists(mockStarshipId);

      expect(mockAccess).toHaveBeenCalledWith(mockFilePath);
      expect(result).toBe(true);
    });

    it('should return false when file does not exist', async () => {
      mockAccess.mockRejectedValue(new Error('File not found'));

      const result = await VisionFileService.visionExists(mockStarshipId);

      expect(mockAccess).toHaveBeenCalledWith(mockFilePath);
      expect(result).toBe(false);
    });

    it('should return false when access fails', async () => {
      mockAccess.mockRejectedValue(new Error('Permission denied'));

      const result = await VisionFileService.visionExists(mockStarshipId);

      expect(result).toBe(false);
    });
  });

  describe('hasVisionContent', () => {
    it('should return true when vision has content', async () => {
      mockReadFile.mockResolvedValue('Vision content');

      const result = await VisionFileService.hasVisionContent(mockStarshipId);

      expect(mockReadFile).toHaveBeenCalledWith(mockFilePath, 'utf8');
      expect(result).toBe(true);
    });

    it('should return false when vision is empty', async () => {
      mockReadFile.mockResolvedValue('');

      const result = await VisionFileService.hasVisionContent(mockStarshipId);

      expect(result).toBe(false);
    });

    it('should return false when vision contains only whitespace', async () => {
      mockReadFile.mockResolvedValue('   \n  \t  ');

      const result = await VisionFileService.hasVisionContent(mockStarshipId);

      expect(result).toBe(false);
    });

    it('should return false when vision file does not exist', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const result = await VisionFileService.hasVisionContent(mockStarshipId);

      expect(result).toBe(false);
    });

    it('should return true when vision has content after trimming', async () => {
      mockReadFile.mockResolvedValue('  \n  Vision content  \n  ');

      const result = await VisionFileService.hasVisionContent(mockStarshipId);

      expect(result).toBe(true);
    });
  });

  describe('static properties and paths', () => {
    it('should construct correct vision directory path', () => {
      // The service uses path.join internally, let's verify the expected calls
      expect(path.join).toHaveBeenCalledWith(
        expect.any(String), // process.cwd() result
        'data',
        'visions'
      );
    });

    it('should construct correct file path for starship', () => {
      // Trigger a method that builds file path
      VisionFileService.visionExists(mockStarshipId);

      expect(path.join).toHaveBeenCalledWith(
        expect.stringContaining('visions'),
        `${mockStarshipId}.txt`
      );
    });
  });

  describe('error handling', () => {
    it('should handle different types of errors gracefully', async () => {
      // Test various error scenarios
      const errorTypes = [
        new Error('ENOENT: no such file or directory'),
        new Error('EACCES: permission denied'),
        new Error('EMFILE: too many open files'),
        'String error', // Non-Error objects
        null, // Null errors
        undefined // Undefined errors
      ];

      for (const error of errorTypes) {
        mockReadFile.mockRejectedValueOnce(error as any);
        const result = await VisionFileService.readVision(mockStarshipId);
        expect(result).toBeNull();
      }
    });

    it('should handle fs-extra method failures consistently', async () => {
      // Test that all methods handle fs errors gracefully
      mockAccess.mockRejectedValue(new Error('Access denied'));
      mockReadFile.mockRejectedValue(new Error('Read failed'));

      expect(await VisionFileService.visionExists(mockStarshipId)).toBe(false);
      expect(await VisionFileService.readVision(mockStarshipId)).toBeNull();
      expect(await VisionFileService.hasVisionContent(mockStarshipId)).toBe(false);
    });
  });
});