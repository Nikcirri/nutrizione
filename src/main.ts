import { mount } from 'svelte';
import '@fontsource-variable/outfit';
import './app.css';
import App from './App.svelte';
import { installGlobalErrorHandlers } from './lib/errors';
import { requestPersistentStorage } from './lib/platform';

installGlobalErrorHandlers();
void requestPersistentStorage();

const target = document.getElementById('app');
if (!target) throw new Error('Elemento #app non trovato');

const app = mount(App, { target });

export default app;
