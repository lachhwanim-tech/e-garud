async function sendDataToGoogleSheet(data) {
    const primaryAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbwdxbFr0JmD53StNfjeduWIlWt8cqh0Mz_GT5dH37cVLctt9lgem33eAgk2fZ5r6hIZiw/exec';
    const otherAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbwdxbFr0JmD53StNfjeduWIlWt8cqh0Mz_GT5dH37cVLctt9lgem33eAgk2fZ5r6hIZiw/exec'; 
    const ALLOWED_HQS = ['BYT', 'R', 'RSD', 'DBEC', 'DURG', 'DRZ', 'MXA', 'BYL', 'BXA', 'AAGH', 'PPYD'];

    const getVal = (arr, labels) => {
        if (!arr || !Array.isArray(arr)) return '';
        const searchLabels = Array.isArray(labels) ? labels : [labels];
        const clean = (str) => String(str || '').replace(/["\n\r]/g, '').trim().toLowerCase();
        const item = arr.find(d => {
            if (!d) return false;
            if (typeof d === 'object' && d.label) {
                const cleanLabel = clean(d.label);
                return searchLabels.some(l => cleanLabel.includes(clean(l)));
            }
            return searchLabels.some(l => clean(d).includes(clean(l)));
        });
        if (!item) return '';
        let result = typeof item === 'object' ? (item.value || '') : String(item);
        if (typeof item !== 'object' && result.includes(':')) result = result.split(':')[1];
        return String(result).replace(/["\n\r]/g, '').trim();
    };

    const now = new Date();
    const currentDateTime = ('0' + now.getDate()).slice(-2) + '/' + ('0' + (now.getMonth()+1)).slice(-2) + '/' + now.getFullYear() + ' ' + ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2) + ':' + ('0' + now.getSeconds()).slice(-2);

    let fromStn = '', toStn = '';
    if (data.stationStops && data.stationStops.length > 0) {
        fromStn = data.stationStops[0].station || '';
        toStn = data.stationStops[data.stationStops.length - 1].station || '';
    }

    let journeyDate = getVal(data.trainDetails, ['Journey Date', 'Date']) || new Date().toLocaleDateString('en-GB');
    let trainNo = getVal(data.trainDetails, ['Train No', 'Train Number', 'Train']);
    let lpId = getVal(data.lpDetails, ['LP ID', 'ID']);

    const abn = {
        bft_nd: document.getElementById('chk-bft-nd')?.checked ? 1 : 0,
        bpt_nd: document.getElementById('chk-bpt-nd')?.checked ? 1 : 0,
        bft_rule: document.getElementById('chk-bft-rule')?.checked ? 1 : 0,
        bpt_rule: document.getElementById('chk-bpt-rule')?.checked ? 1 : 0,
        late_ctrl: document.getElementById('chk-late-ctrl')?.checked ? 1 : 0,
        overspeed: document.getElementById('chk-overspeed')?.checked ? 1 : 0,
        others: document.getElementById('chk-others')?.checked ? 1 : 0
    };

    const payload = {
        dateTime: currentDateTime,
        cliName: getVal(data.trainDetails, ['Analysis By', 'CLI']) || data.cliName || '',
        journeyDate: journeyDate,
        trainNo: trainNo,
        locoNo: getVal(data.trainDetails, ['Loco No', 'Loco Number', 'Loco']),
        fromStn: fromStn,
        toStn: toStn,
        rakeType: getVal(data.trainDetails, ['Type of Rake', 'Rake Type']),
        mps: getVal(data.trainDetails, ['Max Permissible', 'MPS']),
        section: getVal(data.trainDetails, ['Section', 'Route']),
        lpId: lpId,
        lpName: getVal(data.lpDetails, ['LP Name', 'Name']),
        lpGroupCli: getVal(data.lpDetails, ['Group', 'HQ']),
        alpId: getVal(data.alpDetails, ['ALP ID', 'ID']),
        alpName: getVal(data.alpDetails, ['ALP Name', 'Name']),
        alpGroupCli: getVal(data.alpDetails, ['Group', 'HQ']),
        bftStatus: data.bftDetails?.time ? "Done" : "Not done",
        bptStatus: data.bptDetails?.time ? "Done" : "Not done",
        overspeedCount: data.overSpeedDetails ? data.overSpeedDetails.length : 0,
        totalDist: data.speedRangeSummary?.totalDistance || '0',
        avgSpeed: (data.sectionSpeedSummary && data.sectionSpeedSummary[0]?.averageSpeed) || '0',
        maxSpeed: (data.sectionSpeedSummary && data.sectionSpeedSummary[0]?.maxSpeed) || '0',
        cliObs: document.getElementById('cliRemarks')?.value.trim() || 'NIL',
        actionTaken: document.querySelector('input[name="actionTakenRadio"]:checked')?.value || 'NIL',
        bftNotDone: abn.bft_nd,
        bptNotDone: abn.bpt_nd,
        bftRule: abn.bft_rule,
        bptRule: abn.bpt_rule,
        lateCtrl: abn.late_ctrl,
        overspeed: abn.overspeed,
        other: abn.others,
        totalAbn: Object.values(abn).reduce((a, b) => a + b, 0),
        uniqueId: `${lpId}_${trainNo}_${journeyDate.replace(/\//g, '-')}`,
        stops: data.stationStops // Passing detailed stops array
    };

    try {
        let storedHq = localStorage.getItem('currentSessionHq') || document.getElementById('cliHqDisplay')?.value || "UNKNOWN";
        let targetUrl = ALLOWED_HQS.includes(storedHq.toUpperCase()) ? primaryAppsScriptUrl : otherAppsScriptUrl;
        await fetch(targetUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ type: 'data', payload: payload }) });
    } catch (error) { console.error('Error:', error); }
}
