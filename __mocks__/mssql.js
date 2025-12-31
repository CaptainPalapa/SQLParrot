// Manual mock for mssql module
// Jest automatically uses this when any test file requires 'mssql'

const createMockRequest = () => {
  const queries = [
    // First query: SQL Server version
    Promise.resolve({
      recordset: [{ version: 'Microsoft SQL Server 2022 (RTM) - 16.0.1000.6 (X64)\n\nCopyright (c) Microsoft Corporation' }]
    }),
    // Second query: database count
    Promise.resolve({
      recordset: [{ database_count: 5 }]
    })
  ];
  let queryIndex = 0;

  return {
    query: jest.fn(() => {
      const result = queries[queryIndex] || queries[0];
      queryIndex++;
      return result;
    })
  };
};

const mockPool = {
  request: jest.fn(() => createMockRequest()),
  close: jest.fn().mockResolvedValue(undefined),
  connected: true
};

module.exports = {
  connect: jest.fn().mockResolvedValue(mockPool),
  close: jest.fn().mockResolvedValue(undefined),
  ConnectionPool: jest.fn().mockImplementation(() => mockPool),
  Request: jest.fn().mockImplementation(() => createMockRequest()),
  // Include common SQL types that might be used
  NVarChar: jest.fn(),
  VarChar: jest.fn(),
  Int: jest.fn(),
  BigInt: jest.fn(),
  Bit: jest.fn(),
  DateTime: jest.fn()
};

