export interface NewOrder {
  userId: string;
  item: string;
  quantity: number;
}

export interface Order extends NewOrder {
  id: string;
}

export class OrderStore {
  readonly #orders = new Map<string, Order>();
  #nextId = 1;

  create(input: NewOrder): Order {
    const order: Order = { id: String(this.#nextId), ...input };
    this.#nextId++;
    this.#orders.set(order.id, order);
    return order;
  }

  list(): Order[] {
    return [...this.#orders.values()];
  }

  get(id: string): Order | undefined {
    return this.#orders.get(id);
  }
}
