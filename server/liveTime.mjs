const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const messages = {
  insufficient_time: [
    402,
    'You need at least 10 seconds of live time to connect. Fund your account or contact Support.',
  ],
  session_in_use: [
    409,
    'A live session is active or still closing for this account. Stop it in the other tab, then retry.',
  ],
  session_expired: [410, 'This live session expired. Start a new session.'],
  session_stopped: [410, 'This live session was stopped. Start a new session.'],
  ticket_invalid: [401, 'The connection ticket expired or was already used.'],
  account_restricted: [
    403,
    'Your account is restricted from live sessions. Contact Support to request a review.',
  ],
}

export function createLiveTimeService({ client }) {
  async function update(userId, id, action) {
    if (!uuid.test(id || ''))
      return {
        status: 400,
        body: { error: 'A valid session reference is required.' },
      }
    if (!client)
      return {
        status: 503,
        body: {
          error: 'Live-time accounting is not configured on this server.',
        },
      }
    try {
      const { data, error } = await client.rpc('server_live_session', {
        p_user_id: userId,
        p_request_id: id,
        p_action: action,
      })
      if (error || !data || typeof data.active !== 'boolean')
        throw new Error('Invalid accounting response')
      if (!data.active && action !== 'stop') {
        const [status, message] = messages[data.code] || [
          503,
          'Live-time authorization is unavailable.',
        ]
        return { status, body: { error: message, code: data.code } }
      }
      if (
        data.active &&
        (!Number.isFinite(data.remaining_seconds) ||
          data.remaining_seconds < 0 ||
          typeof data.session_id !== 'string')
      )
        throw new Error('Invalid allowance')
      return { status: 200, body: data }
    } catch {
      return {
        status: 503,
        body: {
          error:
            'Live-time verification is unavailable. The live session must stop.',
        },
      }
    }
  }
  return {
    update,
    async ticket(userId, id) {
      if (!uuid.test(id || ''))
        return {
          status: 400,
          body: { error: 'A valid session reference is required.' },
        }
      if (!client)
        return {
          status: 503,
          body: { error: 'Live-time accounting is not configured.' },
        }
      const ticket = 'kt_' + randomBytes(32).toString('base64url')
      try {
        const { data, error } = await client.rpc(
          'server_issue_connection_ticket',
          {
            p_user_id: userId,
            p_lease_id: id,
            p_ticket_hash: hashTicket(ticket),
          },
        )
        if (error || !data || typeof data.active !== 'boolean')
          throw new Error('Accounting unavailable')
        if (!data.active) {
          const [status, message] = messages[data.code] || [
            503,
            'Connection authorization is unavailable.',
          ]
          return { status, body: { error: message, code: data.code } }
        }
        return { status: 200, body: { ...data, connectionTicket: ticket } }
      } catch {
        return {
          status: 503,
          body: { error: 'Connection authorization is unavailable.' },
        }
      }
    },
  }
}
import { createHash, randomBytes } from 'node:crypto'

export const hashTicket = (ticket) =>
  createHash('sha256').update(ticket).digest('hex')
export function createSignalingStore(client) {
  const rpc = async (name, args) => {
    if (!client) throw new Error('Accounting unavailable')
    const { data, error } = await client.rpc(name, args)
    if (error) throw new Error('Accounting unavailable')
    return data
  }
  return {
    claim: (ticket, id) =>
      rpc('server_claim_connection_ticket', {
        p_ticket_hash: hashTicket(ticket),
        p_connection_id: id,
      }),
    check: (id) => rpc('server_check_connection', { p_connection_id: id }),
    record: (id, event, seconds = null, sessionId = null) =>
      rpc('server_record_provider_event', {
        p_connection_id: id,
        p_event: event,
        p_seconds: seconds,
        p_provider_session_id: sessionId,
      }),
    close: (id, confirmed, reason) =>
      rpc('server_close_connection', {
        p_connection_id: id,
        p_confirmed: confirmed,
        p_reason: reason,
      }),
  }
}
