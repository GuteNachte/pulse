import { useEffect, useState } from 'react';
import './App.css';
import { Connect, GetWindowStatus, RefreshWindowStatus } from '../wailsjs/go/main/App';

type WindowStatus = { service: string; connection: string; hub_url: string };

function App() {
    const [hubUrl, setHubUrl] = useState('');
    const [pairingCode, setPairingCode] = useState('');
    const [status, setStatus] = useState<WindowStatus>({ service: '暂未读取', connection: '暂未配置连接', hub_url: '' });
    const [message, setMessage] = useState('');
    const [connecting, setConnecting] = useState(false);

    useEffect(() => {
        GetWindowStatus().then((nextStatus) => {
            setStatus(nextStatus);
            setHubUrl(nextStatus.hub_url || '');
        }).catch(() => setMessage('读取状态失败'));
    }, []);

    const refresh = () => {
        setMessage('正在读取连接状态');
        RefreshWindowStatus().then((nextStatus) => {
            setStatus(nextStatus);
            setMessage('状态已更新');
        }).catch(() => setMessage('读取状态失败'));
    };

    const connect = async () => {
        if (!hubUrl.trim() || !pairingCode.trim()) {
            setMessage('请填写 Hub 地址和机器连接码');
            return;
        }
        setConnecting(true);
        setMessage('正在验证连接');
        try {
            const result = await Connect(hubUrl, pairingCode);
            setPairingCode('');
            setMessage(result.message);
            if (result.success) {
                setStatus(result.status);
                setHubUrl(result.status.hub_url || hubUrl.trim());
            }
        } catch {
            setPairingCode('');
            setMessage('连接失败，请检查 Hub 地址和网络后重试');
        } finally {
            setConnecting(false);
        }
    };

    return (
        <main className="page">
            <header className="header"><div className="brand-mark">P</div><div><h1>Pulse Agent</h1><p>连接配置</p></div></header>
            <section className="status-panel" aria-label="当前状态">
                <div><span>服务状态</span><strong>{status.service}</strong></div>
                <div><span>连接状态</span><strong>{status.connection}</strong></div>
            </section>
            <section className="form-panel">
                <label>Hub 地址<input value={hubUrl} onChange={(event) => setHubUrl(event.target.value)} placeholder="例如：http://192.168.1.10:8090" disabled={connecting} /></label>
                <label>6 位机器连接码<input value={pairingCode} onChange={(event) => setPairingCode(event.target.value)} placeholder="例如：123-456" inputMode="numeric" autoComplete="off" disabled={connecting} /></label>
            </section>
            {message && <p className="message" role="status">{message}</p>}
            <footer className="actions">
                <button className="secondary" onClick={() => setMessage('网页入口将在下一步接入')}>打开 Pulse 网页</button>
            <div className="primary-actions"><button className="secondary" onClick={refresh} disabled={connecting}>重试连接</button><button className="primary" onClick={connect} disabled={connecting}>{connecting ? '正在连接' : '连接'}</button></div>
            </footer>
        </main>
    );
}

export default App;
