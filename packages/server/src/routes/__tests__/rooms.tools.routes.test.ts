import roomsRouter from '@/routes/rooms';

function hasRoute(path: string): boolean {
  return Boolean((roomsRouter as any).stack.find((l: any) => l?.route?.path === path));
}

describe('rooms tool assignment routes', () => {
  it('registers new room tool assignment endpoints', () => {
    expect(hasRoute('/rooms/:roomId/tools')).toBe(true);
    expect(hasRoute('/rooms/:roomId/tools/:toolId')).toBe(true);
    expect(hasRoute('/rooms/:roomId/resources')).toBe(true);
  });

  it('does not register legacy pinned tool endpoints', () => {
    expect(hasRoute('/rooms/:roomId/pins/tools')).toBe(false);
    expect(hasRoute('/rooms/:roomId/pins/tools/reorder')).toBe(false);
    expect(hasRoute('/rooms/:roomId/pins/resources')).toBe(false);
  });
});

