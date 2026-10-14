export interface ComparableOffer {
  id: string;
  price: number;
  currency: string;
  url?: string;
}

export interface Channel3Client {
  findComparableOffers(
    productName: string,
    currency: string,
  ): Promise<ComparableOffer[]>;
}
