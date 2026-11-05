/** @type {import('./$types').PageLoad} */
export const ssr = false;

export async function load({ data }) {
  return {
    ...data,
    layout: 'dashboard'
  };
}
