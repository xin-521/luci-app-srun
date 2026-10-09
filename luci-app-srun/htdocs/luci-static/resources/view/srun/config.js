'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require ui';

var callAction = rpc.declare({ object: 'luci.srun', method: 'action', params: [ 'action' ] });
var callNetif  = rpc.declare({ object: 'luci.srun', method: 'netif' });

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('srun'),
			callNetif().catch(function() { return null; })
		]);
	},

	render: function(data) {
		var ni = data[1] || {};
		var devices = (ni.devices || []).concat(ni.interfaces || []);
		var m, s, o;

		m = new form.Map('srun', _('SRun Portal Authentication'),
			_('Configure the SRun/深澜 portal client. The running service is reloaded on save & apply.'));

		/* ---------- global ---------- */
		s = m.section(form.NamedSection, 'main', 'srun', _('Global settings'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('Enable service'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Value, 'server', _('Portal server'),
			_('Base URL including scheme, e.g. http://10.0.0.1'));
		o.placeholder = 'http://10.0.0.1';
		o.datatype = 'url';
		o.rmempty = false;

		o = s.option(form.Value, 'binary', _('srun binary path'));
		o.placeholder = '/usr/bin/srun';

		o = s.option(form.Flag, 'detect_ip', _('Auto detect authorized IP'),
			_('Let the portal decide which IP to authorize (single-dial).'));

		o = s.option(form.Flag, 'strict_bind', _('Strict bind source IP'));
		o = s.option(form.Flag, 'double_stack', _('Enable double stack'));

		o = s.option(form.Value, 'retry_delay', _('Retry delay (ms)'));
		o.datatype = 'uinteger'; o.default = '1000';
		o = s.option(form.Value, 'retry_times', _('Retry times'));
		o.datatype = 'uinteger'; o.default = '3';
		o = s.option(form.Value, 'interval', _('Re-check interval (s)'));
		o.datatype = 'uinteger'; o.default = '30';

		o = s.option(form.Value, 'acid', _('AC ID'),
			_('Access controller id, deployment specific.'));
		o.datatype = 'uinteger'; o.default = '12';
		o = s.option(form.Value, 'type', _('Auth type'));
		o.datatype = 'uinteger'; o.default = '1';
		o = s.option(form.Value, 'n', _('Parameter n'));
		o.datatype = 'uinteger'; o.default = '200';
		o = s.option(form.Value, 'os', _('Reported OS'));
		o = s.option(form.Value, 'name', _('Reported hostname'));

		o = s.option(form.Value, 'trigger_iface', _('Trigger interface'),
			_('Logical interface whose link-up triggers a re-login.'));
		o.placeholder = 'wan';

		/* ---------- accounts ---------- */
		s = m.section(form.TableSection, 'login', _('Accounts'),
			_('One section per account/interface (multi-dial supported).'));
		s.addremove = true;
		s.anonymous = true;

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.default = '1'; o.rmempty = false;

		o = s.option(form.Value, 'username', _('Username'),
			_('Operator suffix may be required, e.g. @cmcc.'));
		o.rmempty = false;

		o = s.option(form.Value, 'password', _('Password'));
		o.password = true;
		o.rmempty = false;

		o = s.option(form.Value, 'ip', _('IP address'));
		o.datatype = 'ip4addr';

		o = s.option(form.ListValue, 'if_name', _('Interface'),
			_('Real device or logical interface; leave empty when using an explicit IP.'));
		o.editable = true;
		var seen = {};
		devices.sort().forEach(function(n) {
			if (!n || seen[n])
				return;
			seen[n] = true;
			o.value(n, n);
		});

		o = s.option(form.Value, 'comment', _('Comment'));

		return m.render();
	},

	// Save + apply, then explicitly (re)start the service so it does not depend
	// solely on the procd config.change trigger.
	handleSaveApply: function(ev, mode) {
		return this.handleSave(ev)
			.then(function() { return uci.apply(); })
			.then(function() { return callAction('reload').catch(function() {}); })
			.then(function() { return ui.changes.apply(mode); });
	}
});
