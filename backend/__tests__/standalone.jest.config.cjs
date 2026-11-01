module.exports = {
    rootDir: '../..', testEnvironment: 'node', cache: false,
    setupFiles: ['<rootDir>/backend/__tests__/helpers/noPostgres.js', '<rootDir>/backend/__tests__/helpers/release03aNetworkGuard.cjs']
};
