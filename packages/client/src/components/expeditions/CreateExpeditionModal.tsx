'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { 
  X, 
  Plus, 
  Minus, 
  Calendar, 
  Clock, 
  Target, 
  Users, 
  AlertCircle, 
  CheckCircle2,
  Loader2,
  Rocket,
  Settings,
  Tag,
  Zap
} from 'lucide-react';
import { expeditionAPI } from '@/lib/expeditionApi';
import { useExpeditionSocket } from '@/hooks/useExpeditionSocket';
import type { 
  CreateExpeditionRequest, 
  ExpeditionPriority,
  CreateTaskRequest 
} from '@starships/protocol';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

interface CreateExpeditionModalProps {
  open: boolean;
  onClose: () => void;
  onExpeditionCreated: (expeditionId: string) => void;
  starshipId: string;
  starshipSlug: string;
}

interface FormData {
  title: string;
  description: string;
  objective: string;
  priority: ExpeditionPriority;
  estimatedDuration: number | null;
  tags: string[];
  dueDate: string;
  autoStart: boolean;
  // Task configuration
  enableTaskBreakdown: boolean;
  initialTasks: TaskFormData[];
  // Agent configuration
  enableAgentSelection: boolean;
  selectedAgents: string[];
  maxAgents: number;
  // Advanced settings
  enableAdvancedSettings: boolean;
  resourceRequirements: string;
  successCriteria: string;
  riskAssessment: string;
}

interface TaskFormData {
  id: string;
  title: string;
  description: string;
  requiredSkills: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedEffort: number | null;
  deliverable: string;
}

interface ValidationErrors {
  title?: string;
  description?: string;
  objective?: string;
  priority?: string;
  estimatedDuration?: string;
  dueDate?: string;
  tasks?: Record<string, { title?: string; description?: string; deliverable?: string }>;
  general?: string;
}

interface Agent {
  id: string;
  name: string;
  category: string;
  tags: string[];
  status: 'available' | 'busy' | 'offline';
  description?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PRIORITY_OPTIONS: { value: ExpeditionPriority; label: string; color: string; description: string }[] = [
  { value: 'low', label: 'Low', color: 'bg-gray-500', description: 'Non-urgent, can be scheduled flexibly' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-500', description: 'Standard priority, normal timeline' },
  { value: 'high', label: 'High', color: 'bg-orange-500', description: 'Important, needs attention soon' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-500', description: 'Critical, requires immediate action' }
];

const TASK_PRIORITY_OPTIONS: { value: TaskFormData['priority']; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' }
];

const COMMON_TAGS = [
  'research', 'development', 'analysis', 'design', 'testing', 'documentation',
  'planning', 'implementation', 'review', 'optimization', 'integration', 'deployment'
];

const COMMON_SKILLS = [
  'analysis', 'research', 'writing', 'coding', 'design', 'testing', 'planning',
  'communication', 'problem-solving', 'creativity', 'technical-review', 'documentation'
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CreateExpeditionModal({
  open,
  onClose,
  onExpeditionCreated,
  starshipId,
  starshipSlug
}: CreateExpeditionModalProps) {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  
  // Available agents state
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  // Form data state
  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    objective: '',
    priority: 'medium',
    estimatedDuration: null,
    tags: [],
    dueDate: '',
    autoStart: false,
    enableTaskBreakdown: false,
    initialTasks: [],
    enableAgentSelection: false,
    selectedAgents: [],
    maxAgents: 5,
    enableAdvancedSettings: false,
    resourceRequirements: '',
    successCriteria: '',
    riskAssessment: ''
  });

  // Tag input state
  const [tagInput, setTagInput] = useState('');

  // Socket integration
  const { isConnected } = useExpeditionSocket({
    onExpeditionCreated: (event) => {
      if (event.expedition.starshipId === starshipId) {
        onExpeditionCreated(event.expeditionId);
      }
    }
  });

  // ============================================================================
  // FORM VALIDATION
  // ============================================================================

  const validateStep = useCallback((step: number): boolean => {
    const errors: ValidationErrors = {};

    if (step === 1) {
      // Basic information validation
      if (!formData.title.trim()) {
        errors.title = 'Title is required';
      } else if (formData.title.length < 3) {
        errors.title = 'Title must be at least 3 characters';
      } else if (formData.title.length > 100) {
        errors.title = 'Title must be less than 100 characters';
      }

      if (!formData.description.trim()) {
        errors.description = 'Description is required';
      } else if (formData.description.length < 10) {
        errors.description = 'Description must be at least 10 characters';
      } else if (formData.description.length > 500) {
        errors.description = 'Description must be less than 500 characters';
      }

      if (!formData.objective.trim()) {
        errors.objective = 'Objective is required';
      } else if (formData.objective.length < 10) {
        errors.objective = 'Objective must be at least 10 characters';
      } else if (formData.objective.length > 300) {
        errors.objective = 'Objective must be less than 300 characters';
      }

      if (formData.estimatedDuration !== null && formData.estimatedDuration <= 0) {
        errors.estimatedDuration = 'Duration must be greater than 0';
      }

      if (formData.dueDate) {
        const dueDate = new Date(formData.dueDate);
        const now = new Date();
        if (dueDate <= now) {
          errors.dueDate = 'Due date must be in the future';
        }
      }
    }

    if (step === 2 && formData.enableTaskBreakdown) {
      // Task validation
      const taskErrors: ValidationErrors['tasks'] = {};
      
      formData.initialTasks.forEach((task, index) => {
        const taskError: any = {};
        
        if (!task.title.trim()) {
          taskError.title = 'Task title is required';
        } else if (task.title.length > 100) {
          taskError.title = 'Task title must be less than 100 characters';
        }

        if (!task.description.trim()) {
          taskError.description = 'Task description is required';
        } else if (task.description.length > 300) {
          taskError.description = 'Task description must be less than 300 characters';
        }

        if (!task.deliverable.trim()) {
          taskError.deliverable = 'Deliverable description is required';
        } else if (task.deliverable.length > 200) {
          taskError.deliverable = 'Deliverable must be less than 200 characters';
        }

        if (Object.keys(taskError).length > 0) {
          taskErrors[task.id] = taskError;
        }
      });

      if (Object.keys(taskErrors).length > 0) {
        errors.tasks = taskErrors;
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  const validateForm = useCallback((): boolean => {
    return validateStep(1) && validateStep(2) && validateStep(3);
  }, [validateStep]);

  // ============================================================================
  // FORM HANDLERS
  // ============================================================================

  const updateFormData = useCallback((updates: Partial<FormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
    // Clear related validation errors
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      Object.keys(updates).forEach(key => {
        delete newErrors[key as keyof ValidationErrors];
      });
      return newErrors;
    });
  }, []);

  const handleAddTag = useCallback((tag: string) => {
    const trimmedTag = tag.trim().toLowerCase();
    if (trimmedTag && !formData.tags.includes(trimmedTag)) {
      updateFormData({ tags: [...formData.tags, trimmedTag] });
    }
    setTagInput('');
  }, [formData.tags, updateFormData]);

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    updateFormData({ tags: formData.tags.filter(tag => tag !== tagToRemove) });
  }, [formData.tags, updateFormData]);

  const handleAddTask = useCallback(() => {
    const newTask: TaskFormData = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: '',
      description: '',
      requiredSkills: [],
      priority: 'medium',
      estimatedEffort: null,
      deliverable: ''
    };
    updateFormData({ initialTasks: [...formData.initialTasks, newTask] });
  }, [formData.initialTasks, updateFormData]);

  const handleRemoveTask = useCallback((taskId: string) => {
    updateFormData({ 
      initialTasks: formData.initialTasks.filter(task => task.id !== taskId) 
    });
  }, [formData.initialTasks, updateFormData]);

  const handleUpdateTask = useCallback((taskId: string, updates: Partial<TaskFormData>) => {
    updateFormData({
      initialTasks: formData.initialTasks.map(task =>
        task.id === taskId ? { ...task, ...updates } : task
      )
    });
  }, [formData.initialTasks, updateFormData]);

  const handleAddSkillToTask = useCallback((taskId: string, skill: string) => {
    const trimmedSkill = skill.trim().toLowerCase();
    if (!trimmedSkill) return;

    updateFormData({
      initialTasks: formData.initialTasks.map(task =>
        task.id === taskId && !task.requiredSkills.includes(trimmedSkill)
          ? { ...task, requiredSkills: [...task.requiredSkills, trimmedSkill] }
          : task
      )
    });
  }, [formData.initialTasks, updateFormData]);

  const handleRemoveSkillFromTask = useCallback((taskId: string, skillToRemove: string) => {
    updateFormData({
      initialTasks: formData.initialTasks.map(task =>
        task.id === taskId
          ? { ...task, requiredSkills: task.requiredSkills.filter(skill => skill !== skillToRemove) }
          : task
      )
    });
  }, [formData.initialTasks, updateFormData]);

  // ============================================================================
  // AGENT MANAGEMENT
  // ============================================================================

  const loadAvailableAgents = useCallback(async () => {
    if (!starshipId) return;

    setLoadingAgents(true);
    try {
      // Import the API dynamically to avoid circular dependencies
      const { default: api } = await import('@/lib/api');
      const response = await api.get(`/api/starships/${starshipId}/agents`);
      
      if (response.data?.deployedAgents) {
        setAvailableAgents(response.data.deployedAgents);
      }
    } catch (error) {
      console.error('Failed to load available agents:', error);
      // Set empty array to prevent loading state from persisting
      setAvailableAgents([]);
    } finally {
      setLoadingAgents(false);
    }
  }, [starshipId]);

  const handleToggleAgent = useCallback((agentId: string) => {
    const isSelected = formData.selectedAgents.includes(agentId);
    
    if (isSelected) {
      updateFormData({
        selectedAgents: formData.selectedAgents.filter(id => id !== agentId)
      });
    } else if (formData.selectedAgents.length < formData.maxAgents) {
      updateFormData({
        selectedAgents: [...formData.selectedAgents, agentId]
      });
    }
  }, [formData.selectedAgents, formData.maxAgents, updateFormData]);

  // ============================================================================
  // STEP NAVIGATION
  // ============================================================================

  const handleNextStep = useCallback(() => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 4));
    }
  }, [currentStep, validateStep]);

  const handlePrevStep = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  }, []);

  const handleStepClick = useCallback((step: number) => {
    // Allow navigation to previous steps or current step
    if (step <= currentStep) {
      setCurrentStep(step);
    }
  }, [currentStep]);

  // ============================================================================
  // FORM SUBMISSION
  // ============================================================================

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) {
      setSubmitError('Please fix the validation errors before submitting');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Prepare expedition request
      const expeditionRequest: CreateExpeditionRequest = {
        starshipId,
        title: formData.title.trim(),
        description: formData.description.trim(),
        objective: formData.objective.trim(),
        priority: formData.priority,
        estimatedDuration: formData.estimatedDuration || undefined,
        tags: formData.tags,
        dueDate: formData.dueDate || undefined,
        selectedAgents: formData.enableAgentSelection && formData.selectedAgents.length > 0
          ? formData.selectedAgents
          : undefined
      };

      // Create the expedition
      const response = await expeditionAPI.createExpedition(expeditionRequest);
      const expeditionId = response.expedition.id;

      // Create initial tasks if enabled
      if (formData.enableTaskBreakdown && formData.initialTasks.length > 0) {
        const taskPromises = formData.initialTasks.map(task => {
          const taskRequest: CreateTaskRequest = {
            expeditionId,
            title: task.title.trim(),
            description: task.description.trim(),
            requiredSkills: task.requiredSkills,
            priority: task.priority,
            deliverable: task.deliverable.trim(),
            estimatedEffort: task.estimatedEffort || undefined
          };
          return expeditionAPI.createTask(starshipId, taskRequest);
        });

        await Promise.all(taskPromises);
      }

      // Auto-start expedition if enabled
      if (formData.autoStart) {
        await expeditionAPI.startExpedition(starshipId, expeditionId);
      }

      // Notify parent component
      onExpeditionCreated(expeditionId);
      
      // Reset form and close modal
      handleReset();
      onClose();

    } catch (error: any) {
      console.error('Failed to create expedition:', error);
      setSubmitError(
        error.message || 
        'Failed to create expedition. Please check your input and try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    validateForm, 
    starshipId, 
    formData, 
    onExpeditionCreated, 
    onClose
  ]);

  // ============================================================================
  // FORM RESET
  // ============================================================================

  const handleReset = useCallback(() => {
    setFormData({
      title: '',
      description: '',
      objective: '',
      priority: 'medium',
      estimatedDuration: null,
      tags: [],
      dueDate: '',
      autoStart: false,
      enableTaskBreakdown: false,
      initialTasks: [],
      enableAgentSelection: false,
      selectedAgents: [],
      maxAgents: 5,
      enableAdvancedSettings: false,
      resourceRequirements: '',
      successCriteria: '',
      riskAssessment: ''
    });
    setCurrentStep(1);
    setValidationErrors({});
    setSubmitError(null);
    setTagInput('');
  }, []);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Load agents when modal opens and agent selection is enabled
  useEffect(() => {
    if (open && formData.enableAgentSelection && availableAgents.length === 0) {
      loadAvailableAgents();
    }
  }, [open, formData.enableAgentSelection, availableAgents.length, loadAvailableAgents]);

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      handleReset();
    }
  }, [open, handleReset]);

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center space-x-4 mb-8">
      {[1, 2, 3, 4].map((step) => (
        <div key={step} className="flex items-center">
          <button
            onClick={() => handleStepClick(step)}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
              step === currentStep
                ? 'bg-primary text-primary-foreground'
                : step < currentStep
                ? 'bg-green-500 text-white cursor-pointer hover:bg-green-600'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
            disabled={step > currentStep}
          >
            {step < currentStep ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              step
            )}
          </button>
          {step < 4 && (
            <div className={`w-12 h-0.5 mx-2 ${
              step < currentStep ? 'bg-green-500' : 'bg-muted'
            }`} />
          )}
        </div>
      ))}
    </div>
  );

  const renderBasicInformation = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold mb-2">Basic Information</h3>
        <p className="text-sm text-muted-foreground">
          Define the core details of your expedition
        </p>
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title" className="text-sm font-medium">
            Expedition Title *
          </Label>
          <Input
            id="title"
            placeholder="Enter a clear, descriptive title for your expedition"
            value={formData.title}
            onChange={(e) => updateFormData({ title: e.target.value })}
            className={validationErrors.title ? 'border-red-500' : ''}
            maxLength={100}
          />
          {validationErrors.title && (
            <p className="text-sm text-red-500 flex items-center">
              <AlertCircle className="h-4 w-4 mr-1" />
              {validationErrors.title}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {formData.title.length}/100 characters
          </p>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description" className="text-sm font-medium">
            Description *
          </Label>
          <Textarea
            id="description"
            placeholder="Provide a detailed description of what this expedition will accomplish"
            value={formData.description}
            onChange={(e) => updateFormData({ description: e.target.value })}
            className={validationErrors.description ? 'border-red-500' : ''}
            rows={3}
            maxLength={500}
          />
          {validationErrors.description && (
            <p className="text-sm text-red-500 flex items-center">
              <AlertCircle className="h-4 w-4 mr-1" />
              {validationErrors.description}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {formData.description.length}/500 characters
          </p>
        </div>

        {/* Objective */}
        <div className="space-y-2">
          <Label htmlFor="objective" className="text-sm font-medium">
            Primary Objective *
          </Label>
          <Textarea
            id="objective"
            placeholder="Define the specific goal or outcome you want to achieve"
            value={formData.objective}
            onChange={(e) => updateFormData({ objective: e.target.value })}
            className={validationErrors.objective ? 'border-red-500' : ''}
            rows={2}
            maxLength={300}
          />
          {validationErrors.objective && (
            <p className="text-sm text-red-500 flex items-center">
              <AlertCircle className="h-4 w-4 mr-1" />
              {validationErrors.objective}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {formData.objective.length}/300 characters
          </p>
        </div>

        {/* Priority and Duration Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Priority */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Priority Level *</Label>
            <Select
              value={formData.priority}
              onValueChange={(value) => updateFormData({ priority: value as ExpeditionPriority })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${option.color}`} />
                      <span>{option.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {PRIORITY_OPTIONS.find(p => p.value === formData.priority)?.description}
            </p>
          </div>

          {/* Estimated Duration */}
          <div className="space-y-2">
            <Label htmlFor="duration" className="text-sm font-medium">
              Estimated Duration (minutes)
            </Label>
            <Input
              id="duration"
              type="number"
              placeholder="e.g., 120"
              value={formData.estimatedDuration || ''}
              onChange={(e) => updateFormData({ 
                estimatedDuration: e.target.value ? parseInt(e.target.value) : null 
              })}
              className={validationErrors.estimatedDuration ? 'border-red-500' : ''}
              min="1"
            />
            {validationErrors.estimatedDuration && (
              <p className="text-sm text-red-500 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {validationErrors.estimatedDuration}
              </p>
            )}
          </div>
        </div>

        {/* Due Date */}
        <div className="space-y-2">
          <Label htmlFor="dueDate" className="text-sm font-medium">
            Due Date (Optional)
          </Label>
          <Input
            id="dueDate"
            type="datetime-local"
            value={formData.dueDate}
            onChange={(e) => updateFormData({ dueDate: e.target.value })}
            className={validationErrors.dueDate ? 'border-red-500' : ''}
            min={new Date().toISOString().slice(0, 16)}
          />
          {validationErrors.dueDate && (
            <p className="text-sm text-red-500 flex items-center">
              <AlertCircle className="h-4 w-4 mr-1" />
              {validationErrors.dueDate}
            </p>
          )}
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Tags</Label>
          <div className="space-y-2">
            <div className="flex space-x-2">
              <Input
                placeholder="Add tags to categorize your expedition"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag(tagInput);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAddTag(tagInput)}
                disabled={!tagInput.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Common tags */}
            <div className="flex flex-wrap gap-1">
              {COMMON_TAGS.map((tag) => (
                <Button
                  key={tag}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => handleAddTag(tag)}
                  disabled={formData.tags.includes(tag)}
                >
                  {tag}
                </Button>
              ))}
            </div>

            {/* Selected tags */}
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {formData.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderTaskConfiguration = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold mb-2">Task Configuration</h3>
        <p className="text-sm text-muted-foreground">
          Break down your expedition into manageable tasks
        </p>
      </div>

      {/* Enable Task Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Task Breakdown</CardTitle>
              <CardDescription>
                Define specific tasks to organize the expedition workflow
              </CardDescription>
            </div>
            <Switch
              checked={formData.enableTaskBreakdown}
              onCheckedChange={(checked) => updateFormData({ enableTaskBreakdown: checked })}
            />
          </div>
        </CardHeader>
        
        {formData.enableTaskBreakdown && (
          <CardContent className="space-y-4">
            {/* Add Task Button */}
            <Button
              type="button"
              variant="outline"
              onClick={handleAddTask}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Task
            </Button>

            {/* Tasks List */}
            {formData.initialTasks.length > 0 && (
              <ScrollArea className="max-h-96">
                <div className="space-y-4">
                  {formData.initialTasks.map((task, index) => (
                    <Card key={task.id} className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <h4 className="font-medium text-sm">Task {index + 1}</h4>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveTask(task.id)}
                          className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="space-y-3">
                        {/* Task Title */}
                        <div>
                          <Input
                            placeholder="Task title"
                            value={task.title}
                            onChange={(e) => handleUpdateTask(task.id, { title: e.target.value })}
                            className={validationErrors.tasks?.[task.id]?.title ? 'border-red-500' : ''}
                            maxLength={100}
                          />
                          {validationErrors.tasks?.[task.id]?.title && (
                            <p className="text-sm text-red-500 flex items-center">
                              <AlertCircle className="h-4 w-4 mr-1" />
                              {validationErrors.tasks[task.id].title}
                            </p>
                          )}
                        </div>

                        {/* Task Description */}
                        <div>
                          <Textarea
                            placeholder="Task description"
                            value={task.description}
                            onChange={(e) => handleUpdateTask(task.id, { description: e.target.value })}
                            className={validationErrors.tasks?.[task.id]?.description ? 'border-red-500' : ''}
                            rows={2}
                            maxLength={300}
                          />
                          {validationErrors.tasks?.[task.id]?.description && (
                            <p className="text-sm text-red-500 flex items-center">
                              <AlertCircle className="h-4 w-4 mr-1" />
                              {validationErrors.tasks[task.id].description}
                            </p>
                          )}
                        </div>

                        {/* Task Priority and Effort */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Select
                              value={task.priority}
                              onValueChange={(value) => handleUpdateTask(task.id, { priority: value as TaskFormData['priority'] })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Priority" />
                              </SelectTrigger>
                              <SelectContent>
                                {TASK_PRIORITY_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Input
                              type="number"
                              placeholder="Effort (min)"
                              value={task.estimatedEffort || ''}
                              onChange={(e) => handleUpdateTask(task.id, {
                                estimatedEffort: e.target.value ? parseInt(e.target.value) : null
                              })}
                              min="1"
                            />
                          </div>
                        </div>

                        {/* Required Skills */}
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Required Skills</Label>
                          <div className="flex flex-wrap gap-1">
                            {COMMON_SKILLS.map((skill) => (
                              <Button
                                key={skill}
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => handleAddSkillToTask(task.id, skill)}
                                disabled={task.requiredSkills.includes(skill)}
                              >
                                {skill}
                              </Button>
                            ))}
                          </div>
                          {task.requiredSkills.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {task.requiredSkills.map((skill) => (
                                <Badge key={skill} variant="outline" className="text-xs">
                                  {skill}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveSkillFromTask(task.id, skill)}
                                    className="ml-1 hover:text-red-500"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Deliverable */}
                        <div>
                          <Input
                            placeholder="Expected deliverable"
                            value={task.deliverable}
                            onChange={(e) => handleUpdateTask(task.id, { deliverable: e.target.value })}
                            className={validationErrors.tasks?.[task.id]?.deliverable ? 'border-red-500' : ''}
                            maxLength={200}
                          />
                          {validationErrors.tasks?.[task.id]?.deliverable && (
                            <p className="text-sm text-red-500 flex items-center">
                              <AlertCircle className="h-4 w-4 mr-1" />
                              {validationErrors.tasks[task.id].deliverable}
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );

  const renderAgentSelection = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold mb-2">Agent Selection</h3>
        <p className="text-sm text-muted-foreground">
          Choose agents to participate in this expedition
        </p>
      </div>

      {/* Enable Agent Selection */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Agent Assignment</CardTitle>
              <CardDescription>
                Select specific agents for this expedition
              </CardDescription>
            </div>
            <Switch
              checked={formData.enableAgentSelection}
              onCheckedChange={(checked) => {
                updateFormData({ enableAgentSelection: checked });
                if (checked && availableAgents.length === 0) {
                  loadAvailableAgents();
                }
              }}
            />
          </div>
        </CardHeader>
        
        {formData.enableAgentSelection && (
          <CardContent className="space-y-4">
            {/* Max Agents Setting */}
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Maximum Agents</Label>
              <div className="flex items-center space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => updateFormData({ maxAgents: Math.max(1, formData.maxAgents - 1) })}
                  disabled={formData.maxAgents <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-8 text-center text-sm">{formData.maxAgents}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => updateFormData({ maxAgents: Math.min(10, formData.maxAgents + 1) })}
                  disabled={formData.maxAgents >= 10}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Separator />

            {/* Agent List */}
            {loadingAgents ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">Loading agents...</span>
              </div>
            ) : availableAgents.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">No agents available</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={loadAvailableAgents}
                  className="mt-2"
                >
                  Retry
                </Button>
              </div>
            ) : (
              <ScrollArea className="max-h-64">
                <div className="space-y-2">
                  {availableAgents.map((agent) => {
                    const isSelected = formData.selectedAgents.includes(agent.id);
                    const canSelect = isSelected || formData.selectedAgents.length < formData.maxAgents;
                    
                    return (
                      <Card
                        key={agent.id}
                        className={`p-3 cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : canSelect
                            ? 'hover:border-primary/50'
                            : 'opacity-50 cursor-not-allowed'
                        }`}
                        onClick={() => canSelect && handleToggleAgent(agent.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className={`w-3 h-3 rounded-full ${
                              agent.status === 'available' ? 'bg-green-500' :
                              agent.status === 'busy' ? 'bg-yellow-500' : 'bg-gray-500'
                            }`} />
                            <div>
                              <p className="font-medium text-sm">{agent.name}</p>
                              <p className="text-xs text-muted-foreground">{agent.category}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {agent.tags.slice(0, 2).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {isSelected && (
                              <CheckCircle2 className="h-4 w-4 text-primary" />
                            )}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            )}

            {/* Selected Agents Summary */}
            {formData.selectedAgents.length > 0 && (
              <div className="pt-4 border-t">
                <p className="text-sm font-medium mb-2">
                  Selected Agents ({formData.selectedAgents.length}/{formData.maxAgents})
                </p>
                <div className="flex flex-wrap gap-1">
                  {formData.selectedAgents.map((agentId) => {
                    const agent = availableAgents.find(a => a.id === agentId);
                    return agent ? (
                      <Badge key={agentId} variant="secondary" className="text-xs">
                        {agent.name}
                        <button
                          type="button"
                          onClick={() => handleToggleAgent(agentId)}
                          className="ml-1 hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );

  const renderAdvancedSettings = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold mb-2">Advanced Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure additional expedition parameters
        </p>
      </div>

      {/* Auto-start Option */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Auto-start Expedition</CardTitle>
              <CardDescription>
                Automatically start the expedition after creation
              </CardDescription>
            </div>
            <Switch
              checked={formData.autoStart}
              onCheckedChange={(checked) => updateFormData({ autoStart: checked })}
            />
          </div>
        </CardHeader>
      </Card>

      {/* Advanced Settings */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Additional Configuration</CardTitle>
              <CardDescription>
                Optional advanced settings for the expedition
              </CardDescription>
            </div>
            <Switch
              checked={formData.enableAdvancedSettings}
              onCheckedChange={(checked) => updateFormData({ enableAdvancedSettings: checked })}
            />
          </div>
        </CardHeader>
        
        {formData.enableAdvancedSettings && (
          <CardContent className="space-y-4">
            {/* Resource Requirements */}
            <div className="space-y-2">
              <Label htmlFor="resources" className="text-sm font-medium">
                Resource Requirements
              </Label>
              <Textarea
                id="resources"
                placeholder="Describe any specific resources, tools, or access needed"
                value={formData.resourceRequirements}
                onChange={(e) => updateFormData({ resourceRequirements: e.target.value })}
                rows={2}
                maxLength={300}
              />
              <p className="text-xs text-muted-foreground">
                {formData.resourceRequirements.length}/300 characters
              </p>
            </div>

            {/* Success Criteria */}
            <div className="space-y-2">
              <Label htmlFor="success" className="text-sm font-medium">
                Success Criteria
              </Label>
              <Textarea
                id="success"
                placeholder="Define what constitutes success for this expedition"
                value={formData.successCriteria}
                onChange={(e) => updateFormData({ successCriteria: e.target.value })}
                rows={2}
                maxLength={300}
              />
              <p className="text-xs text-muted-foreground">
                {formData.successCriteria.length}/300 characters
              </p>
            </div>

            {/* Risk Assessment */}
            <div className="space-y-2">
              <Label htmlFor="risks" className="text-sm font-medium">
                Risk Assessment
              </Label>
              <Textarea
                id="risks"
                placeholder="Identify potential risks and mitigation strategies"
                value={formData.riskAssessment}
                onChange={(e) => updateFormData({ riskAssessment: e.target.value })}
                rows={2}
                maxLength={300}
              />
              <p className="text-xs text-muted-foreground">
                {formData.riskAssessment.length}/300 characters
              </p>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return renderBasicInformation();
      case 2:
        return renderTaskConfiguration();
      case 3:
        return renderAgentSelection();
      case 4:
        return renderAdvancedSettings();
      default:
        return renderBasicInformation();
    }
  };

  const getStepTitle = (step: number) => {
    switch (step) {
      case 1: return 'Basic Information';
      case 2: return 'Task Configuration';
      case 3: return 'Agent Selection';
      case 4: return 'Advanced Settings';
      default: return 'Basic Information';
    }
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Rocket className="h-5 w-5" />
            <span>Create New Expedition</span>
          </DialogTitle>
          <DialogDescription>
            Set up a new expedition for {starshipSlug}. Follow the steps to configure all aspects of your mission.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {/* Step Indicator */}
          {renderStepIndicator()}

          {/* Step Content */}
          <ScrollArea className="h-[60vh] px-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {renderCurrentStep()}
              </motion.div>
            </AnimatePresence>
          </ScrollArea>
        </div>

        {/* Error Display */}
        {submitError && (
          <div className="px-6 py-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600 flex items-center">
              <AlertCircle className="h-4 w-4 mr-2" />
              {submitError}
            </p>
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {!isConnected && (
              <div className="flex items-center space-x-1 text-yellow-600">
                <AlertCircle className="h-4 w-4" />
                <span className="text-xs">Offline mode</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {currentStep > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={handlePrevStep}
                disabled={isSubmitting}
              >
                Previous
              </Button>
            )}
            
            {currentStep < 4 ? (
              <Button
                type="button"
                onClick={handleNextStep}
                disabled={isSubmitting}
              >
                Next
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="min-w-[120px]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4 mr-2" />
                    Create Expedition
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}