import axios from 'axios';
import { io, Socket } from 'socket.io-client';

const API_URL = 'http://localhost:4000/api';
const WS_URL = 'http://localhost:4000';

interface TestResults {
  success: boolean;
  steps: {
    name: string;
    status: 'pass' | 'fail';
    details?: any;
    error?: any;
  }[];
}

class ExpeditionFlowTester {
  private socket: Socket | null = null;
  private results: TestResults = { success: true, steps: [] };
  private expeditionId: string | null = null;
  
  async runTests() {
    console.log('🚀 Starting Expedition Flow End-to-End Test\n');
    
    try {
      // 1. Setup WebSocket connection
      await this.setupWebSocket();
      
      // 2. Get user and starship info
      const userInfo = await this.getUserInfo();
      
      // 3. Get available agents
      const agents = await this.getAvailableAgents(userInfo.starshipId);
      
      // 4. Create expedition with vision
      await this.createExpedition(userInfo, agents);
      
      // 5. Monitor expedition progress
      await this.monitorExpeditionProgress();
      
      // 6. Verify results
      await this.verifyExpeditionResults();
      
    } catch (error) {
      console.error('❌ Test failed:', error);
      this.results.success = false;
    } finally {
      this.cleanup();
      this.printResults();
    }
  }
  
  private async setupWebSocket() {
    console.log('📡 Setting up WebSocket connection...');
    
    return new Promise<void>((resolve, reject) => {
      this.socket = io(WS_URL, {
        transports: ['websocket'],
        auth: {
          token: 'test-token' // In real test, use actual auth
        }
      });
      
      this.socket.on('connect', () => {
        console.log('✅ WebSocket connected');
        this.logStep('WebSocket Setup', 'pass');
        
        // Setup event listeners
        this.socket!.on('expedition:status-change', (data) => {
          console.log('📊 Status change:', data);
        });
        
        this.socket!.on('expedition:task-update', (data) => {
          console.log('📝 Task update:', data);
        });
        
        this.socket!.on('expedition:agent-activity', (data) => {
          console.log('🤖 Agent activity:', data);
        });
        
        this.socket!.on('expedition:progress', (data) => {
          console.log('📈 Progress:', data);
        });
        
        resolve();
      });
      
      this.socket.on('connect_error', (error) => {
        this.logStep('WebSocket Setup', 'fail', null, error);
        reject(error);
      });
      
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
    });
  }
  
  private async getUserInfo() {
    console.log('\n👤 Getting user info...');
    
    try {
      // In a real test, we'd authenticate first
      // For now, we'll use a mock user ID
      const mockUser = {
        userId: 'test-user-id',
        starshipId: 'test-starship-id'
      };
      
      this.logStep('Get User Info', 'pass', mockUser);
      return mockUser;
    } catch (error) {
      this.logStep('Get User Info', 'fail', null, error);
      throw error;
    }
  }
  
  private async getAvailableAgents(starshipId: string) {
    console.log('\n🤖 Getting available agents...');
    
    try {
      const response = await axios.get(`${API_URL}/agents`, {
        params: { starshipId }
      });
      
      const agents = response.data;
      console.log(`Found ${agents.length} agents`);
      
      // Select appropriate agents for testing
      const selectedAgents = agents.slice(0, 3).map((agent: any) => agent.id);
      
      this.logStep('Get Available Agents', 'pass', { 
        total: agents.length, 
        selected: selectedAgents 
      });
      
      return selectedAgents;
    } catch (error) {
      this.logStep('Get Available Agents', 'fail', null, error);
      // Use mock agents if API fails
      return ['agent-1', 'agent-2', 'agent-3'];
    }
  }
  
  private async createExpedition(userInfo: any, agentIds: string[]) {
    console.log('\n🚢 Creating expedition with vision...');
    
    const expeditionData = {
      userId: userInfo.userId,
      starshipId: userInfo.starshipId,
      title: 'Test Expedition: Build a Task Management System',
      goal: 'Create a comprehensive task management system with user authentication, real-time updates, and analytics',
      vision: {
        description: 'A modern task management platform that helps teams collaborate effectively',
        objectives: [
          'User authentication and authorization',
          'Create, update, delete tasks with rich metadata',
          'Real-time collaboration features',
          'Analytics dashboard for productivity insights',
          'Mobile-responsive design'
        ],
        constraints: [
          'Must use TypeScript and React',
          'Backend should be Node.js with Express',
          'Database: PostgreSQL',
          'Real-time updates via WebSocket'
        ],
        successCriteria: [
          'All CRUD operations working',
          'Real-time updates functioning',
          'Authentication secure',
          'UI responsive on mobile',
          'Analytics showing meaningful data'
        ]
      },
      selectedAgentIds: agentIds
    };
    
    try {
      const response = await axios.post(`${API_URL}/expeditions`, expeditionData);
      this.expeditionId = response.data.id;
      
      console.log(`✅ Expedition created: ${this.expeditionId}`);
      
      // Join expedition room for updates
      if (this.socket) {
        this.socket.emit('expedition:subscribe-progress', this.expeditionId);
      }
      
      this.logStep('Create Expedition', 'pass', { 
        expeditionId: this.expeditionId,
        vision: expeditionData.vision 
      });
      
      return response.data;
    } catch (error) {
      this.logStep('Create Expedition', 'fail', null, error);
      throw error;
    }
  }
  
  private async monitorExpeditionProgress() {
    console.log('\n📊 Monitoring expedition progress...');
    
    const startTime = Date.now();
    const timeout = 120000; // 2 minutes timeout
    
    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(async () => {
        try {
          const response = await axios.get(`${API_URL}/expeditions/${this.expeditionId}`);
          const expedition = response.data;
          
          console.log(`Status: ${expedition.status}, Progress: ${expedition.progress}%`);
          
          if (expedition.status === 'completed' || expedition.status === 'failed') {
            clearInterval(checkInterval);
            this.logStep('Monitor Progress', 'pass', { 
              finalStatus: expedition.status,
              duration: Date.now() - startTime 
            });
            resolve();
          }
          
          if (Date.now() - startTime > timeout) {
            clearInterval(checkInterval);
            this.logStep('Monitor Progress', 'fail', null, 'Timeout waiting for completion');
            resolve();
          }
        } catch (error) {
          console.error('Error checking progress:', error);
        }
      }, 5000); // Check every 5 seconds
    });
  }
  
  private async verifyExpeditionResults() {
    console.log('\n✅ Verifying expedition results...');
    
    try {
      const response = await axios.get(`${API_URL}/expeditions/${this.expeditionId}`);
      const expedition = response.data;
      
      // Check various aspects of the completed expedition
      const verifications = {
        hasRequirements: expedition.requirements?.length > 0,
        hasTasks: expedition.tasks?.length > 0,
        hasAgentActivities: expedition.agentActivities?.length > 0,
        parallelExecution: this.checkParallelExecution(expedition.agentActivities),
        visionAlignment: this.checkVisionAlignment(expedition.requirements, expedition.vision)
      };
      
      const allPassed = Object.values(verifications).every(v => v === true);
      
      this.logStep('Verify Results', allPassed ? 'pass' : 'fail', verifications);
      
      return verifications;
    } catch (error) {
      this.logStep('Verify Results', 'fail', null, error);
      throw error;
    }
  }
  
  private checkParallelExecution(activities: any[]): boolean {
    if (!activities || activities.length < 2) return false;
    
    // Check if any activities have overlapping time ranges
    for (let i = 0; i < activities.length - 1; i++) {
      for (let j = i + 1; j < activities.length; j++) {
        const a1 = activities[i];
        const a2 = activities[j];
        
        if (a1.startTime && a2.startTime && a1.endTime && a2.endTime) {
          const overlap = 
            (a1.startTime <= a2.startTime && a2.startTime <= a1.endTime) ||
            (a2.startTime <= a1.startTime && a1.startTime <= a2.endTime);
          
          if (overlap) return true;
        }
      }
    }
    
    return false;
  }
  
  private checkVisionAlignment(requirements: any[], vision: any): boolean {
    if (!requirements || requirements.length === 0) return false;
    
    // Check if requirements align with vision objectives
    const visionKeywords = [
      ...vision.objectives,
      ...vision.constraints,
      ...vision.successCriteria
    ].join(' ').toLowerCase();
    
    let alignedCount = 0;
    for (const req of requirements) {
      const reqText = (req.title + ' ' + req.description).toLowerCase();
      const keywords = reqText.split(' ').filter(word => word.length > 3);
      
      const hasAlignment = keywords.some(keyword => 
        visionKeywords.includes(keyword)
      );
      
      if (hasAlignment) alignedCount++;
    }
    
    return alignedCount >= requirements.length * 0.7; // 70% alignment threshold
  }
  
  private logStep(name: string, status: 'pass' | 'fail', details?: any, error?: any) {
    this.results.steps.push({ name, status, details, error });
    if (status === 'fail') this.results.success = false;
  }
  
  private cleanup() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
  
  private printResults() {
    console.log('\n' + '='.repeat(50));
    console.log('📋 TEST RESULTS SUMMARY');
    console.log('='.repeat(50));
    
    this.results.steps.forEach(step => {
      const icon = step.status === 'pass' ? '✅' : '❌';
      console.log(`${icon} ${step.name}`);
      if (step.details) {
        console.log('   Details:', JSON.stringify(step.details, null, 2));
      }
      if (step.error) {
        console.log('   Error:', step.error);
      }
    });
    
    console.log('\n' + '='.repeat(50));
    console.log(`Overall: ${this.results.success ? '✅ PASSED' : '❌ FAILED'}`);
    console.log('='.repeat(50));
  }
}

// Run the test
const tester = new ExpeditionFlowTester();
tester.runTests().catch(console.error);