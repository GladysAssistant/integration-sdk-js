const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');

const { FakeGladysServer } = require('./helpers/fake-gladys-server');
const { createClient } = require('./helpers/create-client');

describe('gladys.getHouses() (contract C.3)', () => {
  let server;
  let gladys;

  beforeEach(async () => {
    server = new FakeGladysServer();
    await server.start();
    gladys = createClient(server);
  });

  afterEach(async () => {
    await gladys.disconnect();
    await server.stop();
  });

  it('should GET /house and resolve with the configured houses', async () => {
    server.houses = [{ id: 'house-1', name: 'Maison', selector: 'maison', latitude: 48.85, longitude: 2.35 }];
    const houses = await gladys.getHouses();
    assert.deepEqual(houses, server.houses);
    const requests = server.getRequests('GET', '/house');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].authorization, `Bearer ${server.token}`);
  });

  it('should resolve with an empty array when no house is configured', async () => {
    const houses = await gladys.getHouses();
    assert.deepEqual(houses, []);
  });

  it('should resolve houses with null coordinates when not located', async () => {
    server.houses = [{ id: 'house-1', name: 'Maison', selector: 'maison', latitude: null, longitude: null }];
    const houses = await gladys.getHouses();
    assert.equal(houses[0].latitude, null);
    assert.equal(houses[0].longitude, null);
  });
});
