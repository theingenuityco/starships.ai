import { Queue } from './Queue';

export class InMemoryQueue<T = any> implements Queue<T> {
  private items: T[] = [];
  private resolvers: Array<(value: T) => void> = [];

  enqueue(item: T): void {
    const resolver = this.resolvers.shift();
    if (resolver) {
      resolver(item);
      return;
    }
    this.items.push(item);
  }

  async dequeue(): Promise<T> {
    const item = this.items.shift();
    if (item !== undefined) return item;
    return await new Promise<T>((resolve) => this.resolvers.push(resolve));
  }

  size(): number {
    return this.items.length;
  }
}
