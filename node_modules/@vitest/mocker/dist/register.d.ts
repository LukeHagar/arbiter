import { M as ModuleMockerInterceptor, a as ModuleMockerCompilerHints, b as ModuleMocker } from './mocker.d-CLy5NQZ0.js';
import '@vitest/spy';
import './types.d-kZ7T8ECy.js';

declare function registerModuleMocker(interceptor: (accessor: string) => ModuleMockerInterceptor): ModuleMockerCompilerHints;
declare function registerNativeFactoryResolver(mocker: ModuleMocker): void;

export { registerModuleMocker, registerNativeFactoryResolver };
