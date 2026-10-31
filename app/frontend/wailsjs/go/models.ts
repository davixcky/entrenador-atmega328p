export namespace main {
	
	export class EstadoConexion {
	    conectado: boolean;
	    puerto: string;
	    entrenador: boolean;
	    mensaje: string;
	
	    static createFrom(source: any = {}) {
	        return new EstadoConexion(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.conectado = source["conectado"];
	        this.puerto = source["puerto"];
	        this.entrenador = source["entrenador"];
	        this.mensaje = source["mensaje"];
	    }
	}
	export class Puerto {
	    nombre: string;
	    descripcion: string;
	    esArduino: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Puerto(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.nombre = source["nombre"];
	        this.descripcion = source["descripcion"];
	        this.esArduino = source["esArduino"];
	    }
	}

}

