import React from 'react';

export class ApplicationBoundary extends React.Component {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){
    if(!this.state.failed)return this.props.children;
    return <main style={{minHeight:'100dvh',background:'#090d0f',color:'#f5f5f5',padding:'48px 24px',display:'grid',alignContent:'center',gap:20}}>
      <h1>NaviMuse couldn’t open this screen</h1>
      <p>Your music library is safe. Reload the app to reconnect.</p>
      <button type="button" style={{minHeight:44}} onClick={()=>window.location.reload()}>Reload NaviMuse</button>
    </main>;
  }
}
