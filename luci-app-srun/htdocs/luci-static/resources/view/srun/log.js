'use strict';
'require view';
'require rpc';
'require ui';
'require poll';

var callTail = rpc.declare({ object: 'luci.srun', method: 'tail_log', params: [ 'lines' ] });

function lines_of(d) {
	if (!d)
		return [];
	if (Array.isArray(d.lines))
		return d.lines;
	if (typeof d.lines === 'string')
		return d.lines.split('\n');
	return [];
}

return view.extend({
	load: function() {
		return callTail(300);
	},

	render: function(data) {
		var pre = E('pre',
			{ 'style': 'max-height:70vh;overflow:auto;white-space:pre-wrap' },
			lines_of(data).join('\n') || _('No log entries.'));

		function refresh() {
			return callTail(300).then(function(d) {
				pre.textContent = lines_of(d).join('\n') || _('No log entries.');
				pre.scrollTop = pre.scrollHeight;
			}, function(err) {
				pre.textContent = 'RPC error: %s'.format(
					(err && err.message) ? err.message : String(err));
			});
		}

		poll.add(refresh, 5);

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Service log')),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn cbi-button',
					'click': function() { refresh(); } }, _('Refresh'))
			]),
			pre
		]);
	}
});
