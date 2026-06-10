type Redirect = {
  source: string;
  destination: string;
  permanent: boolean;
};

export const redirectsList: Redirect[] = [
  {
    source: '/launches',
    destination: '/schedule',
    permanent: true,
  },
  {
    source: '/api/uploads/:path*',
    destination: '/uploads/:path*',
    permanent: true,
  },
];

export async function redirects(): Promise<Redirect[]> {
  return redirectsList;
}
