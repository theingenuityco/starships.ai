import { AffirmationDetector } from '../../src/services/AffirmationDetector';

describe('AffirmationDetector', () => {
  let detector: AffirmationDetector;

  beforeEach(() => {
    detector = new AffirmationDetector();
  });

  describe('isAffirmative', () => {
    it('should detect direct affirmations', () => {
      const affirmativeMessages = [
        'yes',
        'yeah',
        'yep',
        'sure',
        'okay',
        'ok',
        'great',
        'perfect',
        'excellent',
        'sounds good',
        'i like it',
        "let's go with that",
        'that works',
        'approve',
        'confirmed',
        'absolutely',
        'definitely'
      ];

      affirmativeMessages.forEach(message => {
        expect(detector.isAffirmative(message)).toBe(true);
      });
    });

    it('should detect contextual affirmations', () => {
      const contextualAffirmations = [
        "that's good",
        "that is great",
        'i love it',
        'i approve of that',
        'go ahead with it',
        'move forward',
        'update the vision',
        'save that',
        'use this',
        'looks good',
        'sounds great',
        'accept it',
        'adopt this',
        "that's exactly what I want",
        'awesome!',
        'much better',
        'now it makes sense',
        'spot on',
        'thank you, that\'s good',
        'perfect vision',
        'exactly what I wanted'
      ];

      contextualAffirmations.forEach(message => {
        expect(detector.isAffirmative(message)).toBe(true);
      });
    });

    it('should not detect non-affirmative messages', () => {
      const nonAffirmativeMessages = [
        'no',
        'maybe',
        'not sure',
        'i disagree',
        'needs work',
        'how about this instead',
        'can you change it',
        'make it better',
        'i don\'t like it'
      ];

      nonAffirmativeMessages.forEach(message => {
        expect(detector.isAffirmative(message)).toBe(false);
      });
    });

    it('should be case insensitive', () => {
      expect(detector.isAffirmative('YES')).toBe(true);
      expect(detector.isAffirmative('Yes')).toBe(true);
      expect(detector.isAffirmative('PERFECT')).toBe(true);
      expect(detector.isAffirmative('Perfect')).toBe(true);
    });

    it('should handle whitespace correctly', () => {
      expect(detector.isAffirmative('  yes  ')).toBe(true);
      expect(detector.isAffirmative('\tgreat\t')).toBe(true);
      expect(detector.isAffirmative('\nok\n')).toBe(true);
    });

    it('should handle empty strings', () => {
      expect(detector.isAffirmative('')).toBe(false);
      expect(detector.isAffirmative('   ')).toBe(false);
    });
  });

  describe('isNegative', () => {
    it('should detect direct negations', () => {
      const negativeMessages = [
        'no',
        'nope',
        'nah',
        'not really',
        'not quite',
        'not exactly',
        'needs work',
        "don't like",
        'disagree',
        'reject',
        'cancel'
      ];

      negativeMessages.forEach(message => {
        expect(detector.isNegative(message)).toBe(true);
      });
    });

    it('should detect contextual negations', () => {
      const contextualNegations = [
        "that's not good",
        "that is not right",
        "i don't want that",
        "let's think about it",
        'not yet',
        'maybe not',
        "i'm not sure",
        "i'm not convinced",
        "close but not quite",
        "doesn't capture what I want",
        'missing something',
        'not quite right',
        'off the mark'
      ];

      contextualNegations.forEach(message => {
        expect(detector.isNegative(message)).toBe(true);
      });
    });

    it('should not detect positive messages as negative', () => {
      const positiveMessages = [
        'yes',
        'great',
        'perfect',
        'i like it',
        'sounds good',
        'exactly right'
      ];

      positiveMessages.forEach(message => {
        expect(detector.isNegative(message)).toBe(false);
      });
    });

    it('should be case insensitive', () => {
      expect(detector.isNegative('NO')).toBe(true);
      expect(detector.isNegative('No')).toBe(true);
      expect(detector.isNegative('NOT REALLY')).toBe(true);
      expect(detector.isNegative('Not Really')).toBe(true);
    });
  });

  describe('isRequestingChanges', () => {
    it('should detect direct change requests', () => {
      const changeRequests = [
        'but can you make it better',
        'however, I need changes',
        'maybe we could adjust it',
        'change this part',
        'modify the vision',
        'adjust the wording',
        'tweak it a bit',
        'refine this section',
        'improve the clarity',
        'enhance the message',
        'make it more specific',
        'can you make it more actionable'
      ];

      changeRequests.forEach(message => {
        expect(detector.isRequestingChanges(message)).toBe(true);
      });
    });

    it('should detect comparative requests', () => {
      const comparativeRequests = [
        'more specific please',
        'make it more actionable',
        'less vague',
        'better explanation needed',
        'stronger language please',
        'weaker emphasis here'
      ];

      comparativeRequests.forEach(message => {
        expect(detector.isRequestingChanges(message)).toBe(true);
      });
    });

    it('should detect conditional requests', () => {
      const conditionalRequests = [
        'what about adding metrics',
        'how about including timeline',
        'consider making it shorter',
        'maybe try this approach',
        'could also mention our values',
        'instead of this, try that',
        'might be better if we focus on...'
      ];

      conditionalRequests.forEach(message => {
        expect(detector.isRequestingChanges(message)).toBe(true);
      });
    });

    it('should not detect simple statements as change requests', () => {
      const simpleStatements = [
        'this is good',
        'i understand',
        'thank you',
        'interesting point',
        'i see'
      ];

      simpleStatements.forEach(message => {
        expect(detector.isRequestingChanges(message)).toBe(false);
      });
    });
  });

  describe('extractFeedback', () => {
    it('should extract specificity feedback', () => {
      const messages = [
        'make it more specific',
        'increase the detail',
        'enhance clarity',
        'boost specificity',
        'too vague',
        'not specific enough'
      ];

      messages.forEach(message => {
        const feedback = detector.extractFeedback(message);
        expect(feedback).toContain('increase_specificity');
      });
    });

    it('should extract actionability feedback', () => {
      const messages = [
        'make it more actionable',
        'increase action items',
        'not actionable enough',
        'how do we implement this'
      ];

      messages.forEach(message => {
        const feedback = detector.extractFeedback(message);
        expect(feedback).toContain('increase_actionability');
      });
    });

    it('should extract length feedback', () => {
      const shortMessages = [
        'make it shorter',
        'more concise please',
        'too long',
        'wordy'
      ];

      shortMessages.forEach(message => {
        const feedback = detector.extractFeedback(message);
        expect(feedback).toContain('reduce_length');
      });

      const longMessages = [
        'make it longer',
        'more detailed please',
        'elaborate on this'
      ];

      longMessages.forEach(message => {
        const feedback = detector.extractFeedback(message);
        expect(feedback).toContain('increase_detail');
      });
    });

    it('should extract timeline feedback', () => {
      const messages = [
        'add a timeline',
        'when will this happen',
        'what about deadlines',
        'schedule needed'
      ];

      messages.forEach(message => {
        const feedback = detector.extractFeedback(message);
        expect(feedback).toContain('add_timeline');
      });
    });

    it('should extract metrics feedback', () => {
      const messages = [
        'add measurable goals',
        'what are the KPIs',
        'how do we measure success',
        'track our progress'
      ];

      messages.forEach(message => {
        const feedback = detector.extractFeedback(message);
        expect(feedback).toContain('add_metrics');
      });
    });

    it('should extract inspiration feedback', () => {
      const messages = [
        'make it more inspiring',
        'more motivating please',
        'not inspiring enough',
        'boring vision statement'
      ];

      messages.forEach(message => {
        const feedback = detector.extractFeedback(message);
        expect(feedback).toContain('increase_inspiration');
      });
    });

    it('should extract clarity feedback', () => {
      const messages = [
        'hard to understand',
        'confusing language',
        'simplify this'
      ];

      messages.forEach(message => {
        const feedback = detector.extractFeedback(message);
        expect(feedback).toContain('increase_clarity');
      });
    });

    it('should remove duplicate feedback', () => {
      const message = 'make it more specific and increase specificity with more detail';
      const feedback = detector.extractFeedback(message);
      
      // Should contain both increase_specificity and increase_detail but no duplicates
      expect(feedback).toContain('increase_specificity');
      expect(feedback).toContain('increase_detail');
      expect(feedback.length).toBe(new Set(feedback).size); // No duplicates
    });

    it('should handle messages with no specific feedback', () => {
      const messages = [
        'hello there',
        'how are you',
        'nice weather today'
      ];

      messages.forEach(message => {
        const feedback = detector.extractFeedback(message);
        expect(feedback).toHaveLength(0);
      });
    });
  });

  describe('analyzeResponse', () => {
    it('should identify clear acceptance', () => {
      const analysis = detector.analyzeResponse('yes, perfect!');
      
      expect(analysis.isAffirmative).toBe(true);
      expect(analysis.isNegative).toBe(false);
      expect(analysis.isRequestingChanges).toBe(false);
      expect(analysis.intent).toBe('accept');
      expect(analysis.confidence).toBeGreaterThan(0.8);
    });

    it('should identify clear rejection', () => {
      const analysis = detector.analyzeResponse('no, I don\'t like it');
      
      expect(analysis.isAffirmative).toBe(false);
      expect(analysis.isNegative).toBe(true);
      expect(analysis.intent).toBe('reject');
      expect(analysis.confidence).toBeGreaterThan(0.8);
    });

    it('should identify modification requests from negative + changes', () => {
      const analysis = detector.analyzeResponse('no, but can you make it more specific?');
      
      expect(analysis.isNegative).toBe(true);
      expect(analysis.isRequestingChanges).toBe(true);
      expect(analysis.intent).toBe('modify');
      expect(analysis.confidence).toBeGreaterThan(0.7);
      expect(analysis.feedback).toContain('increase_specificity');
    });

    it('should identify modification requests without explicit rejection', () => {
      const analysis = detector.analyzeResponse('can you add timeline and make it more actionable?');
      
      expect(analysis.isRequestingChanges).toBe(true);
      expect(analysis.intent).toBe('modify');
      expect(analysis.confidence).toBeGreaterThan(0.7);
      expect(analysis.feedback).toContain('add_timeline');
      expect(analysis.feedback).toContain('increase_actionability');
    });

    it('should handle conflicting signals', () => {
      const analysis = detector.analyzeResponse('yes, it\'s good but can you change this part?');
      
      expect(analysis.isAffirmative).toBe(true);
      expect(analysis.isRequestingChanges).toBe(true);
      expect(analysis.intent).toBe('modify');
      expect(analysis.confidence).toBeGreaterThan(0.5);
      expect(analysis.confidence).toBeLessThan(0.8); // Lower confidence due to conflict
    });

    it('should identify unclear responses', () => {
      const analysis = detector.analyzeResponse('hmm, interesting point');
      
      expect(analysis.intent).toBe('unclear');
      expect(analysis.confidence).toBe(0.5);
    });

    it('should handle empty responses', () => {
      const analysis = detector.analyzeResponse('');
      
      expect(analysis.intent).toBe('unclear');
      expect(analysis.confidence).toBe(0.5);
    });
  });

  describe('generateResponseSuggestion', () => {
    it('should suggest acceptance response', () => {
      const analysis = {
        isAffirmative: true,
        isNegative: false,
        isRequestingChanges: false,
        confidence: 0.9,
        feedback: [],
        intent: 'accept' as const
      };

      const suggestion = detector.generateResponseSuggestion(analysis);
      expect(suggestion).toContain('I\'ll update your vision');
    });

    it('should suggest rejection response', () => {
      const analysis = {
        isAffirmative: false,
        isNegative: true,
        isRequestingChanges: false,
        confidence: 0.85,
        feedback: [],
        intent: 'reject' as const
      };

      const suggestion = detector.generateResponseSuggestion(analysis);
      expect(suggestion).toContain('No problem');
    });

    it('should suggest modification response with specific feedback', () => {
      const analysis = {
        isAffirmative: false,
        isNegative: true,
        isRequestingChanges: true,
        confidence: 0.8,
        feedback: ['increase_specificity', 'add_timeline'],
        intent: 'modify' as const
      };

      const suggestion = detector.generateResponseSuggestion(analysis);
      expect(suggestion).toContain('I understand you\'d like some adjustments');
      expect(suggestion).toContain('make it more specific');
      expect(suggestion).toContain('include timeline elements');
    });

    it('should suggest unclear response', () => {
      const analysis = {
        isAffirmative: false,
        isNegative: false,
        isRequestingChanges: false,
        confidence: 0.4,
        feedback: [],
        intent: 'unclear' as const
      };

      const suggestion = detector.generateResponseSuggestion(analysis);
      expect(suggestion).toContain('I want to make sure I understand correctly');
    });
  });

  describe('generateFeedbackSuggestions', () => {
    it('should generate specific feedback suggestions', () => {
      const detector = new AffirmationDetector();
      
      // Access private method
      const suggestions = (detector as any).generateFeedbackSuggestions([
        'increase_specificity',
        'add_timeline',
        'increase_actionability'
      ]);

      expect(suggestions).toContain('make it more specific');
      expect(suggestions).toContain('include timeline elements');
      expect(suggestions).toContain('add more actionable elements');
    });

    it('should handle empty feedback array', () => {
      const detector = new AffirmationDetector();
      const suggestions = (detector as any).generateFeedbackSuggestions([]);
      
      expect(suggestions).toBe('I\'ll work on improving the overall quality.');
    });

    it('should handle unknown feedback types gracefully', () => {
      const detector = new AffirmationDetector();
      const suggestions = (detector as any).generateFeedbackSuggestions(['unknown_feedback_type']);
      
      expect(suggestions).toBe(''); // Should not crash and return empty string
    });
  });

  describe('Edge cases and robustness', () => {
    it('should handle very long messages', () => {
      const longMessage = 'I think this vision needs to be more specific and actionable with better timeline and metrics and it should be more inspiring and clear with better language that is not confusing and should have measurable outcomes'.repeat(10);
      
      const analysis = detector.analyzeResponse(longMessage);
      expect(analysis.intent).toBe('modify');
      expect(analysis.feedback.length).toBeGreaterThan(0);
    });

    it('should handle special characters and punctuation', () => {
      expect(detector.isAffirmative('yes!!!')).toBe(true);
      expect(detector.isAffirmative('okay.')).toBe(true);
      expect(detector.isNegative('no.')).toBe(true);
      expect(detector.isRequestingChanges('change it!')).toBe(true);
    });

    it('should handle mixed case and formatting', () => {
      expect(detector.isAffirmative('YES, that\'s PERFECT!')).toBe(true);
      expect(detector.isNegative('No, NOT really what I want')).toBe(true);
    });

    it('should handle numeric content', () => {
      const message = 'make it 50% more specific with 2025 timeline';
      const feedback = detector.extractFeedback(message);
      expect(feedback).toContain('increase_specificity');
      expect(feedback).toContain('add_timeline');
    });
  });
});