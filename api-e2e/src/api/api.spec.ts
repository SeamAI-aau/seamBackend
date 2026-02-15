import axios from 'axios';

describe('App bootstrap', () => {
  it('should start the application', async () => {
    const res = await axios.get(`/api`);
    expect(res.status).toBe(200);
  });
});
