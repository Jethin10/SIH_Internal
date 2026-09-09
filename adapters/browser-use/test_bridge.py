import asyncio
import json
import socket
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from bridge import CoreModelTransport, PrivacyPlanner, Agent
from browser_use.browser.session import BrowserSession


class PlannerTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_browser_use_planning_without_browser_construction(self):
        with patch.object(Agent, "__init__", side_effect=AssertionError("Stock constructor forbidden")), patch.object(BrowserSession, "__init__", side_effect=AssertionError("Raw browser forbidden")):
            transport = CoreModelTransport()
            planner = PrivacyPlanner(transport, "session")
            job = asyncio.create_task(planner.plan({"sessionId": "session", "observationId": "one", "safeTask": "Read products", "elements": []}))
            request = await asyncio.wait_for(transport.request, 2)
            self.assertEqual(len(request["messages"]), 2)
            self.assertTrue(all(isinstance(m["content"], str) for m in request["messages"]))
            transport.result.set_result({"memory": "Read products", "evaluation_previous_goal": "Ready", "next_goal": "Finish", "action": [{"gateway": {"type": "done", "message": "No products visible"}}]})
            result = await job
            self.assertEqual(result["action"]["type"], "done")
            self.assertIsNone(planner.browser_session)
            with self.assertRaises(RuntimeError):
                await planner.run()
            with self.assertRaises(RuntimeError):
                await planner.step()

    async def test_native_tools_and_multiple_actions_are_rejected(self):
        for actions in [[{"evaluate": {"code": "document.body.innerHTML"}}], [{"gateway": {"type": "done", "message": "one"}}, {"gateway": {"type": "done", "message": "two"}}]]:
            transport = CoreModelTransport()
            job = asyncio.create_task(PrivacyPlanner(transport, "session").plan({"sessionId": "session", "observationId": "one"}))
            await transport.request
            transport.result.set_result({"action": actions})
            with self.assertRaises(ValueError):
                await job


class GuardTests(unittest.TestCase):
    def test_outbound_sockets_and_subprocesses_denied(self):
        script = """
import sys,socket,subprocess
from bridge import deny_outbound
sys.addaudithook(deny_outbound)
for operation in [lambda:socket.create_connection(('127.0.0.1',9222)), lambda:subprocess.Popen(['not-a-command'])]:
 try:
  operation()
 except PermissionError:
  continue
 raise AssertionError('Bypass permitted')
print('guard passed')
"""
        result = subprocess.run([sys.executable, "-c", script], cwd=Path(__file__).parent, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("guard passed", result.stdout)


if __name__ == "__main__":
    unittest.main()
