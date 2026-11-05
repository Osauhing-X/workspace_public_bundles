import { mount } from 'svelte';
import Module from '../legacy/routes/+page.svelte';
mount(Module, {target:document.getElementById('module')});
