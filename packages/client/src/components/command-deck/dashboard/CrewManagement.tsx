import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';

export function CrewManagement() {
  const crewMembers = [
    { name: "Commander Vale", role: "Navigation", status: "active" },
    { name: "Dr. Chen", role: "Science", status: "research" },
    { name: "Tech Lopez", role: "Engineering", status: "maintenance" }
  ];
  
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Crew Status</h3>
      <div className="space-y-3">
        {crewMembers.map((member, index) => (
          <div key={index} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50">
            <Avatar className="w-8 h-8">
              <div className="w-full h-full bg-primary/20 flex items-center justify-center text-xs">
                {member.name.split(' ').map(n => n[0]).join('')}
              </div>
            </Avatar>
            <div className="flex-1">
              <div className="font-medium text-sm">{member.name}</div>
              <div className="text-xs text-muted-foreground">{member.role}</div>
            </div>
            <div className={`text-xs px-2 py-1 rounded-full ${
              member.status === 'active' ? 'bg-green-100 text-green-800' :
              member.status === 'research' ? 'bg-blue-100 text-blue-800' :
              'bg-yellow-100 text-yellow-800'
            }`}>
              {member.status}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
} 