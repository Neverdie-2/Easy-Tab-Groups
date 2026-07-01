/**
 * Dashboard entry point (docs/PLAN.md §2.6). Mounts the Preact App.
 */
import { render } from 'preact';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (root) {
  render(<App />, root);
}
