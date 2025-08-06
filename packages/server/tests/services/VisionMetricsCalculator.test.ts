import { VisionMetricsCalculator, VisionMetrics } from '../../src/services/VisionMetricsCalculator';

describe('VisionMetricsCalculator', () => {
  let calculator: VisionMetricsCalculator;

  beforeEach(() => {
    calculator = new VisionMetricsCalculator();
  });

  describe('calculateMetrics', () => {
    it('should calculate comprehensive metrics for a good vision', async () => {
      const vision = 'We will create innovative AI solutions that transform workplace collaboration by 2025, empowering 1 million users to achieve 50% better productivity through our cutting-edge platform.';
      const refinementCount = 2;

      const metrics = await calculator.calculateMetrics(vision, refinementCount);

      expect(metrics.clarityScore).toBeGreaterThan(0);
      expect(metrics.clarityScore).toBeLessThanOrEqual(100);
      expect(metrics.specificityScore).toBeGreaterThan(0);
      expect(metrics.specificityScore).toBeLessThanOrEqual(100);
      expect(metrics.actionabilityScore).toBeGreaterThan(0);
      expect(metrics.actionabilityScore).toBeLessThanOrEqual(100);
      expect(metrics.inspirationalScore).toBeGreaterThan(0);
      expect(metrics.inspirationalScore).toBeLessThanOrEqual(100);
      
      expect(metrics.hasObjectives).toBe(true); // Contains "will create"
      expect(metrics.hasTimeframe).toBe(true); // Contains "by 2025"
      expect(metrics.hasMeasurables).toBe(true); // Contains "1 million users" and "50%"
      
      expect(metrics.overallQuality).toBeGreaterThan(0);
      expect(metrics.overallQuality).toBeLessThanOrEqual(100);
      expect(metrics.confidence).toBeGreaterThan(0);
      expect(metrics.confidence).toBeLessThanOrEqual(1);
      expect(metrics.refinementCount).toBe(2);
    });

    it('should calculate metrics for a poor vision', async () => {
      const vision = 'Be good.';
      
      const metrics = await calculator.calculateMetrics(vision);

      expect(metrics.clarityScore).toBeLessThan(50); // Very short and vague
      expect(metrics.specificityScore).toBeLessThan(50); // No specific terms
      expect(metrics.actionabilityScore).toBeLessThan(50); // No action verbs
      expect(metrics.inspirationalScore).toBeLessThan(50); // Too short
      
      expect(metrics.hasObjectives).toBe(false);
      expect(metrics.hasTimeframe).toBe(false);
      expect(metrics.hasMeasurables).toBe(false);
      
      expect(metrics.overallQuality).toBeLessThan(50);
      expect(metrics.confidence).toBeLessThan(0.5);
    });

    it('should handle empty vision gracefully', async () => {
      const vision = '';
      
      const metrics = await calculator.calculateMetrics(vision);

      expect(metrics.clarityScore).toBe(0);
      expect(metrics.specificityScore).toBeGreaterThanOrEqual(0);
      expect(metrics.actionabilityScore).toBeGreaterThanOrEqual(0);
      expect(metrics.inspirationalScore).toBeGreaterThanOrEqual(0);
      expect(metrics.overallQuality).toBeGreaterThanOrEqual(0);
      expect(metrics.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateClarity', () => {
    it('should score clear, well-structured visions highly', () => {
      const calculator = new VisionMetricsCalculator();
      const clearVision = 'We will build innovative software solutions that help businesses streamline their operations and improve efficiency.';
      
      const score = (calculator as any).calculateClarity(clearVision);
      expect(score).toBeGreaterThan(70);
    });

    it('should penalize overly long sentences', () => {
      const calculator = new VisionMetricsCalculator();
      const longSentenceVision = 'We will create and develop and build and construct innovative and groundbreaking and revolutionary software solutions that will help and assist and support businesses and organizations and companies to streamline and optimize and improve their operations and processes and workflows to achieve and accomplish and reach better and superior and enhanced efficiency and productivity and performance outcomes and results.';
      
      const score = (calculator as any).calculateClarity(longSentenceVision);
      expect(score).toBeLessThan(70);
    });

    it('should penalize overly complex words', () => {
      const calculator = new VisionMetricsCalculator();
      const complexVision = 'We shall facilitate revolutionary transformations through sophisticated implementations of cutting-edge technological paradigms.';
      
      const score = (calculator as any).calculateClarity(complexVision);
      expect(score).toBeLessThan(80);
    });

    it('should penalize jargon terms', () => {
      const calculator = new VisionMetricsCalculator();
      const jargonVision = 'We will leverage synergies to optimize paradigm shifts and facilitate transformational outcomes.';
      
      const score = (calculator as any).calculateClarity(jargonVision);
      expect(score).toBeLessThan(70);
    });

    it('should reward clear structure words', () => {
      const calculator = new VisionMetricsCalculator();
      const structuredVision = 'We will build solutions to help customers through innovative methods with dedicated teams for long-term success.';
      
      const score = (calculator as any).calculateClarity(structuredVision);
      expect(score).toBeGreaterThan(60);
    });

    it('should handle appropriate length bonus', () => {
      const calculator = new VisionMetricsCalculator();
      
      // Good length (50-200 words)
      const goodLength = 'We will create innovative AI solutions that transform how businesses operate by providing intelligent automation tools that help teams collaborate more effectively and achieve better outcomes through data-driven insights and streamlined workflows that reduce manual effort and increase productivity across all departments and functions.';
      const goodScore = (calculator as any).calculateClarity(goodLength);
      
      // Too short
      const tooShort = 'Be great.';
      const shortScore = (calculator as any).calculateClarity(tooShort);
      
      // Too long
      const tooLong = 'We will create innovative AI solutions '.repeat(50);
      const longScore = (calculator as any).calculateClarity(tooLong);
      
      expect(goodScore).toBeGreaterThan(shortScore);
      expect(goodScore).toBeGreaterThan(longScore);
    });

    it('should handle empty input', () => {
      const calculator = new VisionMetricsCalculator();
      const score = (calculator as any).calculateClarity('');
      expect(score).toBe(0);
    });
  });

  describe('calculateSpecificity', () => {
    it('should reward specific and measurable elements', () => {
      const calculator = new VisionMetricsCalculator();
      const specificVision = 'We will serve 1 million customers by 2025, achieve $100M revenue, and increase market share by 25% through our innovative platform.';
      
      const score = (calculator as any).calculateSpecificity(specificVision);
      expect(score).toBeGreaterThan(80);
    });

    it('should penalize vague language', () => {
      const calculator = new VisionMetricsCalculator();
      const vagueVision = 'We will do various things with different stuff and generally help some people sometimes achieve various outcomes.';
      
      const score = (calculator as any).calculateSpecificity(vagueVision);
      expect(score).toBeLessThan(50);
    });

    it('should reward numbers and percentages', () => {
      const calculator = new VisionMetricsCalculator();
      const numericalVision = 'We will achieve 95% customer satisfaction, serve 10,000 users, and increase efficiency by 40%.';
      
      const score = (calculator as any).calculateSpecificity(numericalVision);
      expect(score).toBeGreaterThan(75);
    });

    it('should reward domain-specific terms', () => {
      const calculator = new VisionMetricsCalculator();
      const domainVision = 'We will build a comprehensive technology platform that delivers innovative solutions to improve customer experience and drive revenue growth.';
      
      const score = (calculator as any).calculateSpecificity(domainVision);
      expect(score).toBeGreaterThan(65);
    });

    it('should reward specific outcome verbs', () => {
      const calculator = new VisionMetricsCalculator();
      const outcomeVision = 'We will deliver innovative products, create lasting value, and establish market leadership.';
      
      const score = (calculator as any).calculateSpecificity(outcomeVision);
      expect(score).toBeGreaterThan(65);
    });
  });

  describe('calculateActionability', () => {
    it('should reward strong action verbs', () => {
      const calculator = new VisionMetricsCalculator();
      const actionableVision = 'We will create, build, develop, and launch innovative solutions that deliver measurable results.';
      
      const score = (calculator as any).calculateActionability(actionableVision);
      expect(score).toBeGreaterThan(70);
    });

    it('should penalize weak and passive language', () => {
      const calculator = new VisionMetricsCalculator();
      const weakVision = 'We hope to maybe try to attempt some improvements that might possibly help users.';
      
      const score = (calculator as any).calculateActionability(weakVision);
      expect(score).toBeLessThan(40);
    });

    it('should reward process indicators', () => {
      const calculator = new VisionMetricsCalculator();
      const processVision = 'We will achieve success through innovative methods, by leveraging technology, using data-driven approaches.';
      
      const score = (calculator as any).calculateActionability(processVision);
      expect(score).toBeGreaterThan(60);
    });

    it('should reward sequential language', () => {
      const calculator = new VisionMetricsCalculator();
      const sequentialVision = 'First, we will build the platform. Then, we will deploy it. Finally, we will scale operations.';
      
      const score = (calculator as any).calculateActionability(sequentialVision);
      expect(score).toBeGreaterThan(60);
    });

    it('should reward resource allocation mentions', () => {
      const calculator = new VisionMetricsCalculator();
      const resourceVision = 'Our dedicated team will invest significant resources and budget to deliver exceptional results.';
      
      const score = (calculator as any).calculateActionability(resourceVision);
      expect(score).toBeGreaterThan(55);
    });
  });

  describe('calculateInspirational', () => {
    it('should reward inspirational and motivational language', () => {
      const calculator = new VisionMetricsCalculator();
      const inspirationalVision = 'We will revolutionize the industry, transform lives, and create extraordinary impact through breakthrough innovations.';
      
      const score = (calculator as any).calculateInspirational(inspirationalVision);
      expect(score).toBeGreaterThan(75);
    });

    it('should reward positive impact language', () => {
      const calculator = new VisionMetricsCalculator();
      const impactVision = 'We will empower people, improve lives, and make a meaningful difference in the world.';
      
      const score = (calculator as any).calculateInspirational(impactVision);
      expect(score).toBeGreaterThan(70);
    });

    it('should reward future-oriented language', () => {
      const calculator = new VisionMetricsCalculator();
      const futureVision = 'We will shape the future, create tomorrow\'s solutions, and build lasting sustainable impact.';
      
      const score = (calculator as any).calculateInspirational(futureVision);
      expect(score).toBeGreaterThan(65);
    });

    it('should penalize cliché phrases', () => {
      const calculator = new VisionMetricsCalculator();
      const clicheVision = 'We will be best in class, world class, cutting edge, and the next level game changer.';
      
      const score = (calculator as any).calculateInspirational(clicheVision);
      expect(score).toBeLessThan(70); // Should be penalized for clichés
    });

    it('should reward emotional connection words', () => {
      const calculator = new VisionMetricsCalculator();
      const emotionalVision = 'We are passionate and committed to creating solutions that excite and inspire our community.';
      
      const score = (calculator as any).calculateInspirational(emotionalVision);
      expect(score).toBeGreaterThan(70);
    });

    it('should reward community benefit mentions', () => {
      const calculator = new VisionMetricsCalculator();
      const communityVision = 'Together, we will serve our community and create collective value for everyone.';
      
      const score = (calculator as any).calculateInspirational(communityVision);
      expect(score).toBeGreaterThan(60);
    });
  });

  describe('detectObjectives', () => {
    it('should detect clear objectives', () => {
      const calculator = new VisionMetricsCalculator();
      
      const objectiveVisions = [
        'We will create innovative solutions',
        'Our goal is to transform the industry',
        'We aim to achieve excellence',
        'Our mission is to serve customers',
        'We plan to build a better future',
        'We seek to deliver value'
      ];

      objectiveVisions.forEach(vision => {
        expect((calculator as any).detectObjectives(vision)).toBe(true);
      });
    });

    it('should not detect objectives in vague statements', () => {
      const calculator = new VisionMetricsCalculator();
      
      const vagueVisions = [
        'We are a good company',
        'Things happen sometimes',
        'People like our products',
        'Everything is fine'
      ];

      vagueVisions.forEach(vision => {
        expect((calculator as any).detectObjectives(vision)).toBe(false);
      });
    });
  });

  describe('detectTimeframe', () => {
    it('should detect various timeframe indicators', () => {
      const calculator = new VisionMetricsCalculator();
      
      const timeframeVisions = [
        'We will succeed by 2025',
        'Within 5 years, we will lead the market',
        'By Q4, we will launch our product',
        'In the next decade, we will transform',
        'Over the next 3 years, we will grow',
        'Our long-term vision is to excel',
        'By the end of 2024, we will achieve our goals'
      ];

      timeframeVisions.forEach(vision => {
        expect((calculator as any).detectTimeframe(vision)).toBe(true);
      });
    });

    it('should not detect timeframe in timeless statements', () => {
      const calculator = new VisionMetricsCalculator();
      
      const timelessVisions = [
        'We create great products',
        'Our team is dedicated',
        'Quality matters to us',
        'We serve customers well'
      ];

      timelessVisions.forEach(vision => {
        expect((calculator as any).detectTimeframe(vision)).toBe(false);
      });
    });
  });

  describe('detectMeasurables', () => {
    it('should detect measurable elements', () => {
      const calculator = new VisionMetricsCalculator();
      
      const measurableVisions = [
        'We will serve 1 million users',
        'Achieve 95% customer satisfaction',
        'Generate $100M in revenue',
        'Increase efficiency by 50%',
        'Become the #1 solution in our market',
        'Grow 10x faster than competitors',
        'Top 5 provider in the industry',
        'Improve market share significantly'
      ];

      measurableVisions.forEach(vision => {
        expect((calculator as any).detectMeasurables(vision)).toBe(true);
      });
    });

    it('should not detect measurables in qualitative statements', () => {
      const calculator = new VisionMetricsCalculator();
      
      const qualitativeVisions = [
        'We create beautiful products',
        'Our team is amazing',
        'Customers love our service',
        'We provide excellent support'
      ];

      qualitativeVisions.forEach(vision => {
        expect((calculator as any).detectMeasurables(vision)).toBe(false);
      });
    });
  });

  describe('calculateOverallQuality', () => {
    it('should calculate weighted average correctly', () => {
      const calculator = new VisionMetricsCalculator();
      const metrics: VisionMetrics = {
        clarityScore: 80,
        specificityScore: 70,
        actionabilityScore: 90,
        inspirationalScore: 60,
        hasObjectives: true,
        hasTimeframe: true,
        hasMeasurables: true,
        overallQuality: 0,
        confidence: 0,
        refinementCount: 1
      };

      const overall = (calculator as any).calculateOverallQuality(metrics);
      
      // Expected: 80 * 0.25 + 70 * 0.30 + 90 * 0.30 + 60 * 0.15 = 20 + 21 + 27 + 9 = 77
      expect(overall).toBe(77);
    });

    it('should round to nearest integer', () => {
      const calculator = new VisionMetricsCalculator();
      const metrics: VisionMetrics = {
        clarityScore: 83,
        specificityScore: 77,
        actionabilityScore: 81,
        inspirationalScore: 79,
        hasObjectives: true,
        hasTimeframe: true,
        hasMeasurables: true,
        overallQuality: 0,
        confidence: 0,
        refinementCount: 1
      };

      const overall = (calculator as any).calculateOverallQuality(metrics);
      expect(Number.isInteger(overall)).toBe(true);
    });
  });

  describe('calculateConfidence', () => {
    it('should base confidence on overall quality', () => {
      const calculator = new VisionMetricsCalculator();
      const highQualityMetrics: VisionMetrics = {
        clarityScore: 90,
        specificityScore: 85,
        actionabilityScore: 88,
        inspirationalScore: 82,
        hasObjectives: true,
        hasTimeframe: true,
        hasMeasurables: true,
        overallQuality: 87,
        confidence: 0,
        refinementCount: 1
      };

      const confidence = (calculator as any).calculateConfidence(highQualityMetrics);
      expect(confidence).toBeGreaterThan(0.8);
      expect(confidence).toBeLessThanOrEqual(1);
    });

    it('should add completeness bonus', () => {
      const calculator = new VisionMetricsCalculator();
      
      const completeMetrics: VisionMetrics = {
        clarityScore: 70,
        specificityScore: 70,
        actionabilityScore: 70,
        inspirationalScore: 70,
        hasObjectives: true,
        hasTimeframe: true,
        hasMeasurables: true,
        overallQuality: 70,
        confidence: 0,
        refinementCount: 1
      };

      const incompleteMetrics: VisionMetrics = {
        ...completeMetrics,
        hasObjectives: false,
        hasTimeframe: false,
        hasMeasurables: false
      };

      const completeConfidence = (calculator as any).calculateConfidence(completeMetrics);
      const incompleteConfidence = (calculator as any).calculateConfidence(incompleteMetrics);
      
      expect(completeConfidence).toBeGreaterThan(incompleteConfidence);
    });

    it('should penalize very low scores', () => {
      const calculator = new VisionMetricsCalculator();
      
      const lowScoreMetrics: VisionMetrics = {
        clarityScore: 30, // Below threshold of 40
        specificityScore: 35, // Below threshold of 40
        actionabilityScore: 30, // Below threshold of 40
        inspirationalScore: 50,
        hasObjectives: false,
        hasTimeframe: false,
        hasMeasurables: false,
        overallQuality: 36,
        confidence: 0,
        refinementCount: 0
      };

      const confidence = (calculator as any).calculateConfidence(lowScoreMetrics);
      expect(confidence).toBeLessThan(0.3); // Should be quite low due to penalties
    });

    it('should add bonus for high refinement count', () => {
      const calculator = new VisionMetricsCalculator();
      
      const baseMetrics: VisionMetrics = {
        clarityScore: 70,
        specificityScore: 70,
        actionabilityScore: 70,
        inspirationalScore: 70,
        hasObjectives: true,
        hasTimeframe: true,
        hasMeasurables: true,
        overallQuality: 70,
        confidence: 0,
        refinementCount: 0
      };

      const refinedMetrics: VisionMetrics = {
        ...baseMetrics,
        refinementCount: 5
      };

      const baseConfidence = (calculator as any).calculateConfidence(baseMetrics);
      const refinedConfidence = (calculator as any).calculateConfidence(refinedMetrics);
      
      expect(refinedConfidence).toBeGreaterThan(baseConfidence);
    });

    it('should constrain confidence to valid range', () => {
      const calculator = new VisionMetricsCalculator();
      
      // Test upper bound
      const maxMetrics: VisionMetrics = {
        clarityScore: 100,
        specificityScore: 100,
        actionabilityScore: 100,
        inspirationalScore: 100,
        hasObjectives: true,
        hasTimeframe: true,
        hasMeasurables: true,
        overallQuality: 100,
        confidence: 0,
        refinementCount: 10
      };

      const maxConfidence = (calculator as any).calculateConfidence(maxMetrics);
      expect(maxConfidence).toBeLessThanOrEqual(1);

      // Test lower bound
      const minMetrics: VisionMetrics = {
        clarityScore: 0,
        specificityScore: 0,
        actionabilityScore: 0,
        inspirationalScore: 0,
        hasObjectives: false,
        hasTimeframe: false,
        hasMeasurables: false,
        overallQuality: 0,
        confidence: 0,
        refinementCount: 0
      };

      const minConfidence = (calculator as any).calculateConfidence(minMetrics);
      expect(minConfidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('analyzeImprovementAreas', () => {
    it('should identify priority area correctly', () => {
      const calculator = new VisionMetricsCalculator();
      const metrics: VisionMetrics = {
        clarityScore: 80,
        specificityScore: 40, // Lowest score
        actionabilityScore: 70,
        inspirationalScore: 60,
        hasObjectives: true,
        hasTimeframe: false,
        hasMeasurables: false,
        overallQuality: 63,
        confidence: 0.7,
        refinementCount: 1
      };

      const analysis = calculator.analyzeImprovementAreas(metrics);
      
      expect(analysis.priorityArea).toBe('specificity');
    });

    it('should provide appropriate recommendations', () => {
      const calculator = new VisionMetricsCalculator();
      const metrics: VisionMetrics = {
        clarityScore: 60,
        specificityScore: 50,
        actionabilityScore: 45,
        inspirationalScore: 40,
        hasObjectives: false,
        hasTimeframe: false,
        hasMeasurables: false,
        overallQuality: 49,
        confidence: 0.4,
        refinementCount: 0
      };

      const analysis = calculator.analyzeImprovementAreas(metrics);
      
      expect(analysis.recommendations).toContain('Simplify language and break down complex sentences');
      expect(analysis.recommendations).toContain('Add specific metrics, numbers, or measurable outcomes');
      expect(analysis.recommendations).toContain('Use stronger action verbs and implementation-focused language');
      expect(analysis.recommendations).toContain('Add more motivational and forward-looking language');
    });

    it('should identify completeness gaps', () => {
      const calculator = new VisionMetricsCalculator();
      const metrics: VisionMetrics = {
        clarityScore: 80,
        specificityScore: 70,
        actionabilityScore: 75,
        inspirationalScore: 65,
        hasObjectives: false,
        hasTimeframe: false,
        hasMeasurables: false,
        overallQuality: 73,
        confidence: 0.6,
        refinementCount: 1
      };

      const analysis = calculator.analyzeImprovementAreas(metrics);
      
      expect(analysis.completenessGaps).toContain('Clear objectives or goals');
      expect(analysis.completenessGaps).toContain('Timeline or timeframe');
      expect(analysis.completenessGaps).toContain('Measurable outcomes or metrics');
    });

    it('should handle high-quality visions with minimal gaps', () => {
      const calculator = new VisionMetricsCalculator();
      const metrics: VisionMetrics = {
        clarityScore: 85,
        specificityScore: 80,
        actionabilityScore: 88,
        inspirationalScore: 82,
        hasObjectives: true,
        hasTimeframe: true,
        hasMeasurables: true,
        overallQuality: 84,
        confidence: 0.9,
        refinementCount: 3
      };

      const analysis = calculator.analyzeImprovementAreas(metrics);
      
      expect(analysis.recommendations).toHaveLength(0);
      expect(analysis.completenessGaps).toHaveLength(0);
    });
  });

  describe('Edge cases and integration', () => {
    it('should handle Unicode and special characters', async () => {
      const vision = 'We will créate innovative solutions for résumé management! 🚀✨ By 2025, we aim to help 1M+ users achieve 50% better résultats.';
      
      const metrics = await calculator.calculateMetrics(vision);
      
      expect(metrics.clarityScore).toBeGreaterThan(0);
      expect(metrics.specificityScore).toBeGreaterThan(0);
      expect(metrics.hasTimeframe).toBe(true);
      expect(metrics.hasMeasurables).toBe(true);
    });

    it('should handle very long visions', async () => {
      const longVision = `We will revolutionize the technology industry by creating groundbreaking artificial intelligence solutions that transform how businesses operate and individuals interact with technology on a daily basis, empowering organizations worldwide to achieve unprecedented levels of efficiency, innovation, and customer satisfaction through our comprehensive suite of intelligent automation tools, advanced analytics platforms, and cutting-edge machine learning algorithms that seamlessly integrate with existing infrastructure while providing scalable, secure, and user-friendly interfaces that democratize access to powerful AI capabilities for companies of all sizes, from startups to enterprise-level corporations, ultimately fostering a more connected, intelligent, and sustainable digital ecosystem that benefits society as a whole by solving complex challenges in healthcare, education, finance, manufacturing, and environmental sustainability through data-driven insights, predictive modeling, and automated decision-making processes that reduce human error, increase productivity, and unlock new opportunities for growth and innovation across all sectors of the global economy.`;
      
      const metrics = await calculator.calculateMetrics(longVision);
      
      expect(metrics.clarityScore).toBeLessThan(80); // Should be penalized for being too long
      expect(metrics.inspirationalScore).toBeGreaterThan(60); // Should still be inspirational
      expect(metrics.actionabilityScore).toBeGreaterThan(50); // Has action verbs
    });

    it('should be consistent across multiple calculations', async () => {
      const vision = 'We will build innovative AI solutions that serve 1 million users by 2025.';
      
      const metrics1 = await calculator.calculateMetrics(vision);
      const metrics2 = await calculator.calculateMetrics(vision);
      
      expect(metrics1.clarityScore).toBe(metrics2.clarityScore);
      expect(metrics1.specificityScore).toBe(metrics2.specificityScore);
      expect(metrics1.actionabilityScore).toBe(metrics2.actionabilityScore);
      expect(metrics1.inspirationalScore).toBe(metrics2.inspirationalScore);
      expect(metrics1.hasObjectives).toBe(metrics2.hasObjectives);
      expect(metrics1.hasTimeframe).toBe(metrics2.hasTimeframe);
      expect(metrics1.hasMeasurables).toBe(metrics2.hasMeasurables);
    });
  });
});