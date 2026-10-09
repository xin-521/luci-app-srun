'use strict';
'require view';
'require rpc';
'require ui';
'require poll';

var callStatus = rpc.declare({ object: 'luci.srun', method: 'status' });
var callAction = rpc.declare({ object: 'luci.srun', method: 'action', params: [ 'action' ] });
var callLogin  = rpc.declare({ object: 'luci.srun', method: 'login', params: [ 'sid' ] });
var callLogout = rpc.declare({ object: 'luci.srun', method: 'logout', params: [ 'sid' ] });

function fmt_ts(ts) {
	if (!ts)
		return '-';
	var d = new Date(ts * 1000);
	return isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

return view.extend({
	load: function() {
		return callStatus().catch(function(err) {
			return { error: (err && err.message) ? err.message : String(err),
				 enabled: false, running: false, users: [], interfaces: [] };
		});
	},

	handleAction: function(action) {
		return callAction(action).then(function() {
			ui.addNotification(null, E('p', _('Action "%s" issued.').format(action)));
			return this.load().then(L.bind(this.renderStatus, this));
		}.bind(this));
	},

	handleAccount: function(fn, sid) {
		return fn(sid).then(function() {
			ui.addNotification(null, E('p', _('Done.')));
			return this.load().then(L.bind(this.renderStatus, this));
		}.bind(this));
	},

	renderStatus: function(status) {
		var self = this;
		var users = (status && status.users) || [];

		/* one <tr> per account; E() does not flatten nested arrays,
		   so the rows must be appended as siblings, not as a single child */
		var body = [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, _('Section')),
				E('th', { 'class': 'th' }, _('Username')),
				E('th', { 'class': 'th' }, _('IP')),
				E('th', { 'class': 'th' }, _('Status')),
				E('th', { 'class': 'th' }, _('Last check')),
				E('th', { 'class': 'th' }, _('Actions'))
			])
		];

		if (users.length) {
			users.forEach(function(u) {
				body.push(E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td' }, u.sid || ''),
					E('td', { 'class': 'td' }, u.username || ''),
					E('td', { 'class': 'td' }, u.ip || '-'),
					E('td', { 'class': 'td' },
						E('span', { 'class': 'label ' + (u.ok ? 'success' : 'warning') },
							u.ok ? _('Online') : _('Offline'))),
					E('td', { 'class': 'td' }, fmt_ts(u.ts)),
					E('td', { 'class': 'td' }, [
						E('button', { 'class': 'btn cbi-button',
							'click': function() { self.handleAccount(callLogin, u.sid); } }, _('Login')),
						' ',
						E('button', { 'class': 'btn cbi-button',
							'click': function() { self.handleAccount(callLogout, u.sid); } }, _('Logout'))
					])
				]));
			});
		}
		else {
			body.push(E('tr', { 'class': 'tr' },
				E('td', { 'class': 'td', 'colspan': 6 }, _('No accounts configured.'))));
		}

		var node = E('div', {}, [
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Service')),
				E('p', {}, [
					_('State') + ': ',
					E('span', { 'class': 'label ' + (status.running ? 'success' : 'warning') },
						status.running ? _('Running') : _('Stopped'))
				]),
				status.error ? E('p', { 'class': 'label warning' }, status.error) : null,
				E('p', {}, [
					E('button', { 'class': 'btn cbi-button cbi-button-apply',
						'click': function() { self.handleAction('restart'); } }, _('Restart')),
					' ',
					E('button', { 'class': 'btn cbi-button',
						'click': function() { self.handleAction('start'); } }, _('Start')),
					' ',
					E('button', { 'class': 'btn cbi-button',
						'click': function() { self.handleAction('stop'); } }, _('Stop'))
				])
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Accounts')),
				E('table', { 'class': 'table' }, body)
			])
		]);

		var container = document.getElementById('srun-status');
		node.id = 'srun-status';
		if (container && container.parentNode)
			container.parentNode.replaceChild(node, container);
		return node;
	},

	render: function(status) {
		var node = this.renderStatus(status);

		poll.add(L.bind(function() {
			return this.load().then(L.bind(this.renderStatus, this));
		}, this), 10);

		return node;
	}
});
