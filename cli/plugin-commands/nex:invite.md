---
description: Manage workspace invitations — send, list, revoke, or resend invites
---
Help the user manage workspace invitations using these MCP tools:

- **Send invitations**: Use `mcp__nex__send_invite` with `invitees` array of `{email, role}` objects. Role is either `WORKSPACE_ROLE_MEMBER` or `WORKSPACE_ROLE_ADMIN`.
- **List invitations**: Use `mcp__nex__list_invites` to see all pending and accepted invitations.
- **Revoke an invitation**: Use `mcp__nex__revoke_invite` with the invitation `id` to cancel a pending invite.
- **Resend an invitation**: Use `mcp__nex__resend_invite` with the invitation `id` to re-send the email.

If $ARGUMENTS contains emails, send invitations to those addresses with member role by default.
If $ARGUMENTS is empty, list current invitations first, then ask what the user wants to do.
